/* eslint semi: 0, max-len: 0, max-params: 0 */
import HmacSHA256 from 'crypto-js/hmac-sha256'
import SHA256 from 'crypto-js/sha256'
import Hex from 'crypto-js/enc-hex'
import moment from 'moment'

function SigV4Utils() {}

SigV4Utils.sign = function sign(key, msg) {
  const hash = HmacSHA256(msg, key);
  return hash.toString(Hex);
};

SigV4Utils.sha256 = function sha256(msg) {
  const hash = SHA256(msg);
  return hash.toString(Hex);
};

SigV4Utils.getSignatureKey = function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = HmacSHA256(dateStamp, 'AWS4' + key);
  const kRegion = HmacSHA256(regionName, kDate);
  const kService = HmacSHA256(serviceName, kRegion);
  const kSigning = HmacSHA256('aws4_request', kService);
  return kSigning;
};

SigV4Utils.getSignedUrl = function getSignedUrl(protocol, host, uri, service, region, accessKey, secretKey, sessionToken) {
  const time = moment().utc();
  const dateStamp = time.format('YYYYMMDD');
  const amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
  const algorithm = 'AWS4-HMAC-SHA256';
  const method = 'GET';

  const credentialScope = dateStamp + '/' + region + '/' + service + '/' + 'aws4_request';
  let canonicalQuerystring = 'X-Amz-Algorithm=AWS4-HMAC-SHA256';
  canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(accessKey + '/' + credentialScope);
  canonicalQuerystring += '&X-Amz-Date=' + amzdate;
  canonicalQuerystring += '&X-Amz-SignedHeaders=host';

  const canonicalHeaders = 'host:' + host + '\n';
  const payloadHash = SigV4Utils.sha256('');
  const canonicalRequest = method + '\n' + uri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;

  const stringToSign = algorithm + '\n' + amzdate + '\n' + credentialScope + '\n' + SigV4Utils.sha256(canonicalRequest);
  const signingKey = SigV4Utils.getSignatureKey(secretKey, dateStamp, region, service);
  const signature = SigV4Utils.sign(signingKey, stringToSign);

  canonicalQuerystring += '&X-Amz-Signature=' + signature;
  if (sessionToken) {
    canonicalQuerystring += '&X-Amz-Security-Token=' + encodeURIComponent(sessionToken);
  }

  return protocol + '://' + host + uri + '?' + canonicalQuerystring;
}

export default SigV4Utils
