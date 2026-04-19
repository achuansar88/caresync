require('dotenv').config();
const AWS = require('aws-sdk');
const { validationErros } = require('../utils/constants');
const { sendResponse, formatDate } = require('../utils');
const { v4 } = require('uuid');

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
const PROCEDURE_GSI = "procedures-index";

exports.handler = async (event) => {
  const message = "Procedure added successfully"
  try {
    let { procedures, details, rate, isDelete, requirements  } = JSON.parse(event.body);
    const querParams = {
      TableName: PROCEDURES_TABLE,
      IndexName: PROCEDURE_GSI, // Querying the GSI
      KeyConditionExpression: "procedures = :procedures",
      ExpressionAttributeValues: {
          ":procedures": procedures.toUpperCase()
      }
  };

  const existingProcedure = await dynamoDB.query(querParams).promise();

  if (existingProcedure.Items.length > 0) {
      return sendResponse(400, { message: "Already exists", error: existingProcedure });
  }

    const procedureId = v4();
    const now = formatDate(new Date().toISOString()).split('T')[0];
    const params = {
      TableName: PROCEDURES_TABLE,
      Item: {
        procedureId,
        procedures: procedures.toUpperCase(),
        details,
        rate,
        requirements,
        isDelete,
        "createdBy": "",
        "createdDateTime":   formatDate(new Date().toISOString()),
        "lastUpdatedTime":   formatDate(new Date().toISOString())
      },
    };
    await dynamoDB.put(params).promise();
   
    return sendResponse(201, {
      message, data: {
        procedureId
      },
    });
  } catch (error) {
    return sendResponse(500, { message: "Error adding procedures", error: error.message });
  }
};