require('dotenv').config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { UpdateCommand, DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { validationErros } = require('../utils/constants');
const { sendResponse } = require('../utils');
const pateintInput = require('../utils/patient.json');

// const isOffline = process.env.IS_OFFLINE === 'dev';
const region = process.env.aws_region;
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const isOffline = true;
const client = new DynamoDBClient({
  region: region,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});
const dynamoDB = DynamoDBDocumentClient.from(client);
// const dynamoDB = new AWS.DynamoDB.DocumentClient({
//   region: isOffline ? 'localhost' : 'ap-south-1',
//   endpoint: isOffline ? 'http://localhost:8000' : undefined,
// });
const validateHeight = (height) => {
  // Convert input to a number
  const number = parseFloat(height);
  // Check if it's a valid number and within range
  return /^[0-9]*\.?[0-9]+$/.test(height) && number >= 0.1 && number <= 500;
};

const validateWeight = (weight) => {
  // Convert input to a number
  const number = parseFloat(weight);
  // Check if it's a valid number and within range
  return /^[0-9]*\.?[0-9]+$/.test(weight) && number >= 0.1 && number <= 500;
};

const PATIENTS_TABLE = process.env.PATIENTS_TABLE;
const validateInput = (inputData) => {
  const validation = []

  const { height, weight } = inputData;

  if (height && !validateHeight(height)) {
    validation.push(validationErros.heightError);
  }
  if (weight && !validateWeight(weight)) {
    validation.push(validationErros.weightError);
  }
  return validation;
}

function mergeAllergyData(oldAllergy = {}, newAllergy = {}) {
  const merged = { ...oldAllergy };

  const categories = ["food", "medicines", "other"];
  for (const category of categories) {
    const oldItems = oldAllergy[category] || [];
    const newItems = newAllergy[category] || [];

    const mergedItems = [
      ...oldItems,
      ...newItems.filter(
        (newItem) =>
          newItem.item.trim() !== "" &&
          !oldItems.some((oldItem) => oldItem.item === newItem.item)
      ),
    ];

    merged[category] = mergedItems;
  }

  return merged;
}

async function updatePatient(patientId, updateData) {
  try {
    let updateExpressions = [];
    let expressionAttributeValues = {};
    let expressionAttributeNames = {};
    let hasArrayUpdates = false; // Track if any array updates exist

    Object.entries(updateData).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      expressionAttributeNames[attrName] = key;

      if (Array.isArray(value)) {
        // If value is an array, append to existing list
        updateExpressions.push(`${attrName} = list_append(if_not_exists(${attrName}, :empty_list), ${attrValue})`);
        expressionAttributeValues[attrValue] = value;
        hasArrayUpdates = true; // Mark that we have an array update
      } else {
        // If value is a scalar (string, number), update directly
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeValues[attrValue] = value;
      }
    });

    // Add `:empty_list` only if there are array updates
    if (hasArrayUpdates) {
      expressionAttributeValues[":empty_list"] = [];
    }

    const params = new UpdateCommand({
      TableName: PATIENTS_TABLE,
      Key: { patientId },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    });

    const response = await dynamoDB.send(params);
    return response.Attributes; // Updated patient data
  } catch (error) {
    console.error("Error updating patient:", error.message);
    return null;
  }
}

async function getPatientById(patientId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: PATIENTS_TABLE,
      Key: { patientId },
    })
  );
  return result.Item;
}
/**
 * Update Vitals
 */
exports.handler = async (event) => {
  const message = "Patient vitals updated successfully"
  try {
    const { patientId, vitals } = JSON.parse(event.body);
    const updateData = { ...vitals }

    const existingPatient = await getPatientById(parseInt(patientId));

    if (!existingPatient) {
      return sendResponse(404, { message: "Patient not found" });
    }

    // Merge allergy
    if (updateData.allergy) {
      updateData.allergy = mergeAllergyData(existingPatient.allergy, updateData.allergy);
    }
    // if(updateData.height && updateData.weight){
    //   updateData['bmi'] =  Math.round((updateData.weight/((updateData.height/100)*(updateData.height/100))));
    // }
    if (updateData && updateData.prescription && updateData.prescription.length > 0) {
      const currentDate = new Date().toLocaleDateString("de-DE");
      updateData.prescription.forEach(prescription => {
        prescription.date = currentDate;
      });
    }
    const updatedPatient = await updatePatient(parseInt(patientId), updateData);

    return sendResponse(200, {
      message, data: updatedPatient,
    });
  } catch (error) {

    return sendResponse(500, { message: "Error updating patient", error: error.message });
    // };
  }
};
