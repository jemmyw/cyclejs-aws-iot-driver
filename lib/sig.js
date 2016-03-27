'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _hmacSha = require('crypto-js/hmac-sha256');

var _hmacSha2 = _interopRequireDefault(_hmacSha);

var _sha = require('crypto-js/sha256');

var _sha2 = _interopRequireDefault(_sha);

var _encHex = require('crypto-js/enc-hex');

var _encHex2 = _interopRequireDefault(_encHex);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint semi: 0, max-len: 0, max-params: 0 */


function SigV4Utils() {}

SigV4Utils.sign = function sign(key, msg) {
  var hash = (0, _hmacSha2.default)(msg, key);
  return hash.toString(_encHex2.default);
};

SigV4Utils.sha256 = function sha256(msg) {
  var hash = (0, _sha2.default)(msg);
  return hash.toString(_encHex2.default);
};

SigV4Utils.getSignatureKey = function getSignatureKey(key, dateStamp, regionName, serviceName) {
  var kDate = (0, _hmacSha2.default)(dateStamp, 'AWS4' + key);
  var kRegion = (0, _hmacSha2.default)(regionName, kDate);
  var kService = (0, _hmacSha2.default)(serviceName, kRegion);
  var kSigning = (0, _hmacSha2.default)('aws4_request', kService);
  return kSigning;
};

SigV4Utils.getSignedUrl = function getSignedUrl(protocol, host, uri, service, region, accessKey, secretKey, sessionToken) {
  var time = (0, _moment2.default)().utc();
  var dateStamp = time.format('YYYYMMDD');
  var amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
  var algorithm = 'AWS4-HMAC-SHA256';
  var method = 'GET';

  var credentialScope = dateStamp + '/' + region + '/' + service + '/' + 'aws4_request';
  var canonicalQuerystring = 'X-Amz-Algorithm=AWS4-HMAC-SHA256';
  canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(accessKey + '/' + credentialScope);
  canonicalQuerystring += '&X-Amz-Date=' + amzdate;
  canonicalQuerystring += '&X-Amz-SignedHeaders=host';

  var canonicalHeaders = 'host:' + host + '\n';
  var payloadHash = SigV4Utils.sha256('');
  var canonicalRequest = method + '\n' + uri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;

  var stringToSign = algorithm + '\n' + amzdate + '\n' + credentialScope + '\n' + SigV4Utils.sha256(canonicalRequest);
  var signingKey = SigV4Utils.getSignatureKey(secretKey, dateStamp, region, service);
  var signature = SigV4Utils.sign(signingKey, stringToSign);

  canonicalQuerystring += '&X-Amz-Signature=' + signature;
  if (sessionToken) {
    canonicalQuerystring += '&X-Amz-Security-Token=' + encodeURIComponent(sessionToken);
  }

  return protocol + '://' + host + uri + '?' + canonicalQuerystring;
};

exports.default = SigV4Utils;