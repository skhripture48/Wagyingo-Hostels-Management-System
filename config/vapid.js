const webpush = require('web-push');

// Set VAPID details
webpush.setVapidDetails(
    'mailto:admin@wagyingo.com', // Replace with your email
    'BPH_bYeETv82wTTnOSsBJ69_rxSELuBq_i8vVvIumpnYR0KTRVOeuAjg6riPtU299SBTy5BE2TYkQ1gMNb7x_hM', // Public Key
    'x_WrmsYiaAv7uTfwqTDE1orCe9StBJ1zxakGgYE96kE' // Private Key
);

module.exports = webpush; 