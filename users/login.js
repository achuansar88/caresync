const AWS = require('aws-sdk')
const { sendResponse, validateInput, decodeAndVerifyIdToken } = require("../utils");

const { aws_region } = process.env;
const cognito = new AWS.CognitoIdentityServiceProvider({
  region: aws_region,
});

module.exports.handler = async (event) => {
    try {
        // const isValid = validateInput(event.body)
        // if (!isValid)
        //     return sendResponse(400, { message: 'Invalid input' })

        const { username, password } = JSON.parse(event.body)
        const { client_id } = process.env
        const params = {
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: client_id,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
          },
        };
        const response = await cognito.initiateAuth(params).promise();
        const user = await decodeAndVerifyIdToken(response.AuthenticationResult.IdToken);
        return sendResponse(200, { message: 'Success', token: response.AuthenticationResult.IdToken, role: user['cognito:groups'][0] });

    }
    catch (error) {
        const message = error.message ? error.message : 'Internal server error'
        return sendResponse(message == 'Incorrect username or password.'? 400: 500, { message });
    }
}