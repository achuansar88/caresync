require('dotenv').config();
const AWS = require('aws-sdk');
const { sendResponse } = require('../utils');
// const isOffline = process.env.IS_OFFLINE === 'dev';
const isOffline = true;

// const dynamoDB = new AWS.DynamoDB.DocumentClient({
//   region: isOffline ? 'localhost' : 'ap-south-1',
//   endpoint: isOffline ? 'http://localhost:8000' : undefined,
// });

const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: process.env.aws_region,
   credentials: {
     accessKeyId: process.env.AWS_ACC,   // Optional if aws-cli is configured
     secretAccessKey: process.env.AWS_SECR
   }
 });

const PATIENTS_TABLE = process.env.PATIENTS_TABLE;
const PATIENTS_LIST_GSI = "patientname-index";

/**
 * List Patients
 */
exports.handler = async (event) => {
  const searchName = event.queryStringParameters?.name || '';
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey;

  const defaultExactName = "all"; // Optional: handle exact match fallback

  let params = {
    TableName: PATIENTS_TABLE,
    ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    ProjectionExpression: 'patientId, #name, age, gender, createdDateTime, lastVisits, lastVisitedDateTime, phone, nameLower, review, place, advice, observation',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  };

  try {
    let data;
    if (searchName) {
      // Scan for partial search
      params.FilterExpression = 'contains(#nameLower, :nameLower)';
      params.ExpressionAttributeNames['#nameLower'] = 'nameLower';
      params.ExpressionAttributeValues = {
        ':nameLower': searchName.toLowerCase(),
      };
      data = await dynamoDB.scan(params).promise();

      // Sort manually by lastVisitDateTime
      data.Items.sort((a, b) => new Date(b.lastVisitedDateTime) - new Date(a.lastVisitedDateTime));
    } else {
      const limit = parseInt(event.queryStringParameters?.limit || 30);
      // Query for exact match and sorting
      params.Limit = limit,
      params.IndexName = PATIENTS_LIST_GSI;
      params.KeyConditionExpression = 'patientName = :pname';
      params.ExpressionAttributeValues = {
        ':pname': 'all',
      };
      params.ScanIndexForward = false; // DESC by lastVisitDateTime
      data = await dynamoDB.query(params).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        items: data.Items,
        lastEvaluatedKey: data.LastEvaluatedKey
          ? JSON.stringify(data.LastEvaluatedKey)
          : null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports.getPatientDetails = async (event) => {
  const patientId = parseInt(event.queryStringParameters?.patientId);

  const querParams = {
    TableName: PATIENTS_TABLE,
    KeyConditionExpression: "patientId = :patientId",
    ExpressionAttributeValues: {
      ":patientId": patientId
    }
  };

  const result = await dynamoDB.query(querParams).promise();
  // const querParams = {
  //   TableName: PATIENT_LABTESTS_TABLE,
  //   KeyConditionExpression: "patientLabTestsId = :patientLabTestsId",
  //   ExpressionAttributeValues: {
  //     ":patientLabTestsId": patientLabTestsId
  //   }
  // };

  // const patientTestsData = await dynamo.query(querParams).promise();
  let items = result.Items;

  return sendResponse(200, {message: "Patient details", data: items});
};