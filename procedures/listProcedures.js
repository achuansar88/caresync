require('dotenv').config();
const AWS = require('aws-sdk');
const { sendResponse } = require('../utils');
// const isOffline = process.env.IS_OFFLINE === 'dev';
const isOffline = true;

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.aws_region,
     credentials: {
       accessKeyId: process.env.AWS_ACC,   // Optional if aws-cli is configured
       secretAccessKey: process.env.AWS_SECR
     }
   });

const PROCEDURES_TABLE = process.env.PROCEDURES_TABLE;

/**
 * List Patients
 */
exports.handler = async (event) => {
  const message = "Procedures listed successfully"
  const searchProcedure = event.queryStringParameters.procedures;

  const params = {
      TableName: PROCEDURES_TABLE,
      FilterExpression: 'contains(procedures, :procedures)',
      ExpressionAttributeValues: {
          ':procedures': searchProcedure?searchProcedure.toUpperCase():'',
      }
  };

  try {
      const data = await dynamoDB.scan(params).promise();
      const filteredData = data.Items.map(item => {
          return {
              procedureId: item.procedureId,
              procedure: item.procedures,
              details: item.details
          };
      });
      return sendResponse(200, { message: message, data: filteredData });
     
  } catch (error) {
      return sendResponse(500, { message: error.message, error: error });
  }
};