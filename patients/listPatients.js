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
     accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // Optional if aws-cli is configured
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
   }
 });

const PATIENTS_TABLE = process.env.PATIENTS_TABLE;

/**
 * List Patients
 */
exports.handler = async (event) => {
  const message = "Patient listed successfully"

  // try {

  //   const scanResults = [];
  //   let items = await dynamoDB.scan({TableName: PATIENTS_TABLE}).promise()
  //   items.Items.forEach((item) => scanResults.push(item));

  //   return sendResponse(200, {
  //     message, data: scanResults});
  // } catch (error) {

  //   return sendResponse(500, { message: "Error fetching patients", error: error.message });

  // }

  const searchName = event.queryStringParameters?.name || '';
  const patientId = event.queryStringParameters?.patientId || '';
  const limit = parseInt(event.queryStringParameters?.limit || 10);
  const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey || null;

  let params = {
    TableName: PATIENTS_TABLE,
    Limit: limit,
    ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : null,
  };
  if (patientId) {
    // Fetch all attributes if projectId is present
    // params.ProjectionExpression = undefined; // No projection, fetch all attributes
  } else {
    // Fetch only specific attributes if projectId is not present
    params.ProjectionExpression = 'patientId, #name, age, gender, createdDateTime';
    params.ExpressionAttributeNames = {
      '#name': 'name', // Alias for reserved keyword 'name'
    };
  }
  if (patientId) {
    // Fetch data based on patientId
    params.KeyConditionExpression = 'patientId = :patientId';
    // params.ExpressionAttributeValues = {
    //   ':patientId': parseInt(patientId),
    // };
  } else if (searchName) {
    // Search by name using a filter expression
    params.FilterExpression = 'contains(#name, :name)';
    params.ExpressionAttributeNames = {
      '#name': 'name',
    };
    params.ExpressionAttributeValues = {
      ':name': searchName,
    };
  }

  try {
    const data = await dynamoDB.scan(params).promise();

    // Sort the data by createdDateTime
    const sortedItems = data.Items.sort((a, b) => {
      return new Date(b.createdDateTime) - new Date(a.createdDateTime);
    });

    //   const filteredItems = sortedItems.map(item => ({
    //     patientId: item.patientId,
    //     name: item.name,
    //     age: item.age,
    //     gender: item.gender,
    // }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        items: sortedItems,
        lastEvaluatedKey: data.LastEvaluatedKey ? JSON.stringify(data.LastEvaluatedKey) : null,
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