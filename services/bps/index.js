const { BpsClient, BpsApiError, readRows, readPageInfo } = require("./bps-client");
const discovery = require("./bps-discovery");

const bpsClient = new BpsClient();

module.exports = {
  bpsClient,
  BpsClient,
  BpsApiError,
  readRows,
  readPageInfo,
  ...discovery,
};
