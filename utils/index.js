var jwt = require('jsonwebtoken');
var jwkToPem = require('jwk-to-pem');
const axios = require('axios');
const { aws_region, client_id, userpool_id } = process.env;
// const REGION = aws_region;
const USER_POOL_ID = 'ap-south-1_LsJKNR6Ug';
// const CLIENT_ID = client_id;

const JWKS_URL = `https://cognito-idp.${aws_region}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
const sendResponse = (statusCode, body) => {
    const response = {
        statusCode: statusCode,
        body: JSON.stringify(body)
    }
    return response
}

const validateInput = (data) => {
    const body = JSON.parse(data);
    const { email, password } = body
    if (!email || !password || password.length < 8)
        return false
    return true
}

const formatDate = (isoString) => {

    const date = new Date(isoString);

    // Get IST offset in milliseconds (UTC+5:30 = 330 minutes)
    const istOffsetMs = 330 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffsetMs);

    const year = istDate.getFullYear();
    const month = String(istDate.getMonth() + 1).padStart(2, '0');
    const day = String(istDate.getDate()).padStart(2, '0');
    const hours = String(istDate.getHours()).padStart(2, '0');
    const minutes = String(istDate.getMinutes()).padStart(2, '0');
    const seconds = String(istDate.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    
}

async function decodeAndVerifyIdToken(idToken) {
    try {
        // Fetch the JWKS from the Cognito User Pool
        const response = await axios.get(JWKS_URL);
        const jwks = response.data;

        // Decode the ID token to get the header
        const decodedToken = jwt.decode(idToken, { complete: true });
        if (!decodedToken) {
            throw new Error('Invalid token');
        }

        // Find the matching JWK for the token's key ID (kid)
        const kid = decodedToken.header.kid;
        const jwk = jwks.keys.find(key => key.kid === kid);
        if (!jwk) {
            throw new Error('JWK not found for the given kid');
        }

        // Convert the JWK to PEM format
        const pem = jwkToPem(jwk);

        // Verify the token using the PEM
        const verifiedToken = jwt.verify(idToken, pem, {
            algorithms: ['RS256'],
            issuer: `https://cognito-idp.${aws_region}.amazonaws.com/${USER_POOL_ID}`,
            audience: client_id,
        });
        return verifiedToken;
    } catch (error) {
        console.error('Error decoding or verifying token:', error);
        throw error;
    }
}


module.exports = {
    sendResponse, validateInput, decodeAndVerifyIdToken, formatDate
};