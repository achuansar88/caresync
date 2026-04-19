require('dotenv').config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { UpdateCommand, DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { sendResponse } = require('../utils');

const region = process.env.aws_region;
const ACCESS_KEY = process.env.AWS_ACC;
const SECRET_KEY = process.env.AWS_SECR;

const client = new DynamoDBClient({
  region: region,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});
const dynamoDB = DynamoDBDocumentClient.from(client);

const PATIENTS_TABLE = process.env.PATIENTS_TABLE;

async function getPatientById(patientId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: PATIENTS_TABLE,
      Key: { patientId: parseInt(patientId) },
    })
  );
  return result.Item;
}

async function updatePatient(patientId, updateData) {
  let updateExpressions = [];
  let expressionAttributeValues = {};
  let expressionAttributeNames = {};

  Object.entries(updateData).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    expressionAttributeNames[attrName] = key;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeValues[attrValue] = value;
  });

  const params = {
    TableName: PATIENTS_TABLE,
    Key: { patientId: parseInt(patientId) },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW",
  };

  const response = await dynamoDB.send(new UpdateCommand(params));
  return response.Attributes;
}

exports.handler = async (event) => {
  try {
    const { patientId, reviewId, observationId } = JSON.parse(event.body);

    if (!patientId) {
      return sendResponse(400, { message: "Patient ID is required" });
    }

    if (!reviewId && !observationId) {
      return sendResponse(400, { message: "At least reviewId or observationId must be provided" });
    }

    const patient = await getPatientById(patientId);
    if (!patient) {
      return sendResponse(404, { message: "Patient not found" });
    }

    const updateData = {};

    if (reviewId && patient.review) {
      const reviewIndex = patient.review.findIndex(r => r.reviewId === reviewId);
      if (reviewIndex !== -1) {
        patient.review[reviewIndex].isDelete = true;
        updateData.review = patient.review;
      } else {
        return sendResponse(404, { message: "Review not found" });
      }
    }

    if (observationId && patient.observation) {
      const observationIndex = patient.observation.findIndex(o => o.observationId === observationId);
      if (observationIndex !== -1) {
        patient.observation[observationIndex].isDelete = true;
        updateData.observation = patient.observation;
      } else {
        return sendResponse(404, { message: "Observation not found" });
      }
    }

    if (Object.keys(updateData).length > 0) {
      await updatePatient(patientId, updateData);
      return sendResponse(200, { message: "Review/Observation marked as deleted successfully" });
    } else {
      return sendResponse(400, { message: "No updates made" });
    }

  } catch (error) {
    console.error("Error:", error);
    return sendResponse(500, { message: "Internal server error", error: error.message });
  }
};