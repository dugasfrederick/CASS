/**
 *  A contact is an identity that we do not own. Using the public key we may: 1.
 *  Send them information (by encrypting data with their public key) 2. Verify a
 *  signed message that was sent (by using the verify function of the public key)
 *  3. Distinguish between this identity and other identities through the
 *  displayName.
 *  
 *  @author fray
 */
var EcContact = function() {};
EcContact = stjs.extend(EcContact, null, [], function(constructor, prototype) {
    prototype.pk = null;
    prototype.displayName = null;
    prototype.source = null;
    prototype.getImageUrl = function() {
        return "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/User_icon_2.svg/48px-User_icon_2.svg.png";
    };
}, {pk: "EcPk"}, {});
/**
 *  An identity is an alias that a person or system may own. It consists of a
 *  private key and a display name. Using the private key we may: 1. Perform all
 *  operations of a EcContact. 2. Decrypt messages using our private key. 3. Sign
 *  messages, ensuring the recipient knows that we sent the message and it was
 *  not altered.
 *  
 *  @author fray
 */
var EcIdentity = function() {
    this.displayName = "Alias " + EcIdentity.identityCounter++;
};
EcIdentity = stjs.extend(EcIdentity, null, [], function(constructor, prototype) {
    constructor.identityCounter = 1;
    prototype.ppk = null;
    prototype.displayName = null;
    prototype.source = null;
    prototype.equals = function(obj) {
        if (stjs.isInstanceOf(obj.constructor, EcIdentity)) 
            return this.ppk.equals((obj).ppk);
        return Object.prototype.equals.call(this, obj);
    };
    /**
     *  Helper function to encrypt an identity into a credential (storable
     *  version of an identity)
     *  
     *  @param secret
     *             AES secret used to encrypt the credential.
     *  @return Encrypted credential object.
     */
    prototype.toCredential = function(secret) {
        var c = new EbacCredential();
        c.iv = EcAes.newIv(32);
        c.ppk = EcAesCtr.encrypt(this.ppk.toPem(), secret, c.iv);
        c.displayNameIv = EcAes.newIv(32);
        c.displayName = EcAesCtr.encrypt(this.displayName, secret, c.iv);
        return c;
    };
    /**
     *  Helper function to decrypt a credential (storable version of an identity)
     *  into an identity)
     *  
     *  @param credential
     *             Credential to decrypt.
     *  @param secret
     *             AES secret used to decrypt the credential.
     *  @param source
     *             Source of the credential, used to track where a credential
     *             came from.
     *  @return Decrypted identity object, ready for use.
     */
    constructor.fromCredential = function(credential, secret, source) {
        var i = new EcIdentity();
        i.ppk = EcPpk.fromPem(EcAesCtr.decrypt(credential.ppk, secret, credential.iv));
        i.source = source;
        if (credential.displayName != null && credential.displayNameIv != null) 
            i.displayName = EcAesCtr.decrypt(credential.displayName, secret, credential.iv);
        return i;
    };
}, {ppk: "EcPpk"}, {});
/**
 *  Manages identities and contacts, provides hooks to respond to identity and
 *  contact events, and builds signatures and signature sheets for authorizing
 *  movement of data. Also provides helper functions for identity management.
 *  
 *  @author fritz.ray@eduworks.com
 */
var EcIdentityManager = function() {};
EcIdentityManager = stjs.extend(EcIdentityManager, null, [], function(constructor, prototype) {
    constructor.main = function(args) {
        EcIdentityManager.readContacts();
    };
    constructor.ids = new Array();
    constructor.contacts = new Array();
    constructor.onIdentityAdded = null;
    constructor.onContactAdded = null;
    constructor.identityAdded = function(identity) {
        if (EcIdentityManager.onIdentityAdded != null) 
            EcIdentityManager.onIdentityAdded(identity);
    };
    constructor.contactAdded = function(contact) {
        if (EcIdentityManager.onContactAdded != null) 
            EcIdentityManager.onContactAdded(contact);
        EcIdentityManager.saveContacts();
    };
    /**
     *  Reads contact data from localstorage.
     */
    constructor.readContacts = function() {
        var localStore = localStorage["contacts"];
        if (localStore == null) 
            return;
        var c = JSON.parse(localStore);
        for (var i = 0; i < c.length; i++) {
            var contact = new EcContact();
            var o = new Object();
            var props = (o);
            contact.displayName = props["displayName"];
            contact.pk = EcPk.fromPem(props["ok"]);
            contact.source = props["source"];
            EcIdentityManager.contacts.push(contact);
        }
    };
    /**
     *  Writes contact data to localstorage.
     */
    constructor.saveContacts = function() {
        var c = new Array();
        for (var i = 0; i < EcIdentityManager.contacts.length; i++) {
            var o = new Object();
            var props = (o);
            var contact = EcIdentityManager.contacts[i];
            props["displayName"] = contact.displayName;
            props["pk"] = contact.pk.toPem();
            props["source"] = contact.source;
            c.push(o);
        }
        localStorage["contacts"] = c;
    };
    /**
     *  Adds an identity to the identity manager. Checks for duplicates. Triggers
     *  events.
     *  
     *  @param identity
     *             Identity to add.
     */
    constructor.addIdentity = function(identity) {
        for (var i = 0; i < EcIdentityManager.ids.length; i++) 
            if (EcIdentityManager.ids[i].equals(identity)) 
                return;
        EcIdentityManager.ids.push(identity);
        EcIdentityManager.identityAdded(identity);
    };
    /**
     *  Adds a contact to the identity manager. Checks for duplicates. Triggers
     *  events.
     *  
     *  @param contact
     *             Contact to add.
     */
    constructor.addContact = function(contact) {
        for (var i = 0; i < EcIdentityManager.ids.length; i++) 
            if (EcIdentityManager.contacts[i].equals(contact)) 
                return;
        EcIdentityManager.contacts.push(contact);
        EcIdentityManager.contactAdded(contact);
    };
    /**
     *  Create a signature sheet, authorizing movement of data outside of our
     *  control.
     *  
     *  @param identityPksinPem
     *             Which identities to create signatures for.
     *  @param duration
     *             Length of time in milliseconds to authorize control.
     *  @param server
     *             Server that we are authorizing.
     *  @return JSON Array containing signatures.
     */
    constructor.signatureSheetFor = function(identityPksinPem, duration, server) {
        var signatures = new Array();
        var crypto = new EcRsaOaep();
        for (var j = 0; j < EcIdentityManager.ids.length; j++) {
            var ppk = EcIdentityManager.ids[j].ppk;
            var ourPem = ppk.toPk().toPem();
            if (identityPksinPem != null) 
                for (var i = 0; i < identityPksinPem.length; i++) {
                    var ownerPem = identityPksinPem[i];
                    if (ourPem.equals(ownerPem)) {
                        signatures.push(EcIdentityManager.createSignature(duration, server, crypto, ppk).atIfy());
                    }
                }
        }
        return JSON.stringify(signatures);
    };
    /**
     *  Create a signature sheet for all identities, authorizing movement of data
     *  outside of our control.
     *  
     *  @param duration
     *             Length of time in milliseconds to authorize control.
     *  @param server
     *             Server that we are authorizing.
     *  @return JSON Array containing signatures.
     */
    constructor.signatureSheet = function(duration, server) {
        var signatures = new Array();
        var crypto = new EcRsaOaep();
        for (var j = 0; j < EcIdentityManager.ids.length; j++) {
            var ppk = EcIdentityManager.ids[j].ppk;
            signatures.push(EcIdentityManager.createSignature(duration, server, crypto, ppk).atIfy());
        }
        return JSON.stringify(signatures);
    };
    constructor.createSignature = function(duration, server, crypto, ppk) {
        var s = new EbacSignature();
        s.owner = ppk.toPk().toPem();
        s.expiry = new Date().getTime() + duration;
        s.server = server;
        s.signature = EcRsaOaep.sign(ppk, s.toJson());
        return s;
    };
    /**
     *  Get PPK from PK (if we have it)
     *  
     *  @param fromPem
     *             PK to use to look up PPK
     *  @return PPK or null.
     */
    constructor.getPpk = function(fromPem) {
        var pem = fromPem.toPem();
        for (var i = 0; i < EcIdentityManager.ids.length; i++) {
            if (pem.equals(EcIdentityManager.ids[i].ppk.toPk().toPem())) 
                return EcIdentityManager.ids[i].ppk;
        }
        return null;
    };
}, {ids: {name: "Array", arguments: ["EcIdentity"]}, contacts: {name: "Array", arguments: ["EcContact"]}, onIdentityAdded: {name: "Callback1", arguments: ["EcIdentity"]}, onContactAdded: {name: "Callback1", arguments: ["EcContact"]}}, {});
if (!stjs.mainCallDisabled) 
    EcIdentityManager.main();
/**
 *  Logs into and stores/retrieves credentials from a compatible remote server.
 *  Performs complete anonymization of the user.
 *  
 *  Requires initialization with application specific salts. Application specific
 *  salts prevent co-occurrence attacks, should credentials in one application be
 *  compromised (intercepted in transit).
 *  
 *  Transmits hashed username, hashed password, and encrypts credentials using
 *  the hashed combination of the username and password. This prevents the system
 *  storing the credentials from having any knowledge of the user.
 *  
 *  Password recovery is done through, when the password changes, creating a
 *  cryptographic pad (or perfect cipher) where one half is stored on the server,
 *  and the other half is stored with the user. Should the user lose this pad and
 *  forget their password, they are not able to recover or reset their password,
 *  and their data should be considered lost.
 *  
 *  @author fritz.ray@eduworks.com
 */
var EcRemoteIdentityManager = function() {};
EcRemoteIdentityManager = stjs.extend(EcRemoteIdentityManager, null, [], function(constructor, prototype) {
    prototype.usernameSalt = null;
    prototype.usernameIterations = 0;
    prototype.usernameWidth = 0;
    prototype.passwordSalt = null;
    prototype.passwordIterations = 0;
    prototype.passwordWidth = 0;
    prototype.secretSalt = null;
    prototype.secretIterations = 0;
    prototype.configured = false;
    prototype.selectedServer = null;
    prototype.usernameWithSalt = null;
    prototype.passwordWithSalt = null;
    prototype.secretWithSalt = null;
    prototype.pad = null;
    prototype.token = null;
    /**
     *  Configure parameters of the remote login storage.
     *  
     *  @param usernameSalt
     *             Salt used in hashing the username.
     *  @param usernameIterations
     *             Number of times to hash the username.
     *  @param usernameWidth
     *             Resultant width of username in bytes.
     *  @param passwordSalt
     *             Salt used to hash password.
     *  @param passwordIterations
     *             Number of times to hash password.
     *  @param passwordWidth
     *             Resultant width of password in bytes.
     *  @param secretSalt
     *             Salt used to hash secret (composed of username + password)
     *  @param secretIterations
     *             Number of times to hash secret.
     */
    prototype.configure = function(usernameSalt, usernameIterations, usernameWidth, passwordSalt, passwordIterations, passwordWidth, secretSalt, secretIterations) {
        this.usernameSalt = usernameSalt;
        this.usernameIterations = usernameIterations;
        this.usernameWidth = usernameWidth;
        this.passwordSalt = passwordSalt;
        this.passwordIterations = passwordIterations;
        this.passwordWidth = passwordWidth;
        this.secretSalt = secretSalt;
        this.secretIterations = secretIterations;
        this.configured = true;
    };
    /**
     *  Wipes login data.
     */
    prototype.clear = function() {
        this.usernameWithSalt = null;
        this.passwordWithSalt = null;
        this.secretWithSalt = null;
        this.pad = null;
        this.token = null;
    };
    /**
     *  Configure compatible remote identity management server.
     *  
     *  @param server
     *             URL to remote identity management server.
     */
    prototype.setIdentityManagementServer = function(server) {
        this.selectedServer = server;
    };
    /**
     *  "Log Into" system, generating credentials. Does not actually remotely
     *  access any machine.
     *  
     *  Please clear username and password fields after this function is called.
     *  
     *  @param username
     *             Username
     *  @param password
     *             Password
     */
    prototype.login = function(username, password) {
        if (!this.configured) 
            alert("Remote Identity not configured.");
        this.usernameWithSalt = forge.util.encode64(forge.pkcs5.pbkdf2(username, this.usernameSalt, this.usernameIterations, this.usernameWidth));
        this.passwordWithSalt = forge.util.encode64(forge.pkcs5.pbkdf2(password, this.passwordSalt, this.passwordIterations, this.passwordWidth));
        var arys = new Array();
        arys.push(username, password);
        var secret = this.splicePasswords(arys);
        this.secretWithSalt = forge.util.encode64(forge.pkcs5.pbkdf2(secret, this.secretSalt, this.secretIterations, 32));
    };
    /**
     *  Fetch credentials from server, invoking events based on login success or
     *  failure.
     *  
     *  Automatically populates EcIdentityManager.
     *  
     *  Requires login().
     *  
     *  @param success
     *  @param failure
     */
    prototype.fetch = function(success, failure) {
        if (!this.configured) 
            alert("Remote Identity not configured.");
        if (this.usernameWithSalt == null || this.passwordWithSalt == null || this.secretWithSalt == null) {
            alert("Please log in before performing this operation.");
            return;
        }
        var r = new EbacCredentialRequest();
        r.username = this.usernameWithSalt;
        r.password = this.passwordWithSalt;
        var fd = new FormData();
        fd.append("credentialRequest", r.toJson());
        var me = this;
        EcRemote.postExpectingObject(this.selectedServer, "sky/id/login", fd, function(arg0) {
            var cs = arg0;
            me.pad = cs.pad;
            me.token = cs.token;
            for (var i = 0; i < cs.credentials.length; i++) {
                var c = cs.credentials[i];
                var identity = EcIdentity.fromCredential(c, me.secretWithSalt, me.selectedServer);
                EcIdentityManager.addIdentity(identity);
            }
            success(arg0);
        }, function(arg0) {
            failure(arg0);
        });
    };
    /**
     *  Commits credentials in EcIdentityManager to remote server.
     *  
     *  Will trigger pad generation and fail if the pad has not been specified.
     *  
     *  @param success
     *  @param failure
     *  @param padGenerationCallback
     */
    prototype.commit = function(success, failure, padGenerationCallback) {
        var service = "sky/id/commit";
        this.sendCredentials(success, failure, padGenerationCallback, service);
    };
    /**
     *  Creates an account.
     *  
     *  Please note that the remote login server does not throw error messages if
     *  an account creation is blocked due to being a duplicate. This prevents
     *  login probing. This will always succeed (if the request is properly
     *  formed and makes it to the server).
     *  
     *  Will trigger pad generation and fail if the pad has not been specified.
     *  
     *  @param success
     *  @param failure
     *  @param padGenerationCallback
     */
    prototype.create = function(success, failure, padGenerationCallback) {
        var service = "sky/id/create";
        this.sendCredentials(success, failure, padGenerationCallback, service);
    };
    prototype.sendCredentials = function(success, failure, padGenerationCallback, service) {
        if (!this.configured) 
            alert("Remote Identity not configured.");
        if (this.usernameWithSalt == null || this.passwordWithSalt == null || this.secretWithSalt == null) {
            alert("Please log in before performing this operation.");
            return;
        }
        var credentials = new Array();
        if (this.pad == null) 
            this.pad = padGenerationCallback.callback();
        for (var i = 0; i < EcIdentityManager.ids.length; i++) {
            var id = EcIdentityManager.ids[i];
            credentials.push(id.toCredential(this.secretWithSalt));
        }
        var commit = new EbacCredentialCommit();
        commit.username = this.usernameWithSalt;
        commit.password = this.passwordWithSalt;
        commit.token = this.token;
        commit.credentials.pad = this.pad;
        commit.credentials.credentials = credentials;
        var fd = new FormData();
        fd.append("credentialCommit", commit.toJson());
        EcRemote.postExpectingString(this.selectedServer, service, fd, function(arg0) {
            success(arg0);
        }, function(arg0) {
            failure(arg0);
        });
    };
    /**
     *  Splices together passwords (in a fashion more like shuffling a deck of
     *  cards, not appending).
     *  
     *  @param passwords
     *             Passwords to splice.
     *  @return Spliced password.
     */
    prototype.splicePasswords = function(passwords) {
        var passwordSplice = "";
        for (var charIndex = 0; charIndex > 0; charIndex++) {
            var foundAny = false;
            for (var passwordIndex = 0; passwordIndex < passwords.length; passwordIndex++) {
                if (charIndex >= passwords[passwordIndex].length) 
                    continue;
                passwordSplice += passwords[passwordIndex].charAt(charIndex);
                foundAny = true;
            }
            if (!foundAny) 
                break;
        }
        return passwordSplice;
    };
}, {}, {});
