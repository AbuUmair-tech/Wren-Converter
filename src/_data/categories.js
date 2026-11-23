// Categories shown on the site. Ones marked "hidden" in categoryList.json
// are kept for later but left out of every page, menu and picker.
module.exports = require('./categoryList.json').filter((c) => !c.hidden);
