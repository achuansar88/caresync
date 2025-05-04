require('dotenv').config();
const AWS = require('aws-sdk');
const { validationErros } = require('../utils/constants');
const { sendResponse } = require('../utils');
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
/**
 * Function to generate auto-incrementing userId
 */

const validateName = (str) => /^[a-zA-Z.]+(?: [a-zA-Z.]+)*$/.test(str);
const validateAge = (age) => {
  // Convert input to a number
  const number = parseFloat(age);
  // Check if it's a valid number and within range
  return /^[0-9]*\.?[0-9]+$/.test(age) && number >= 0.1 && number <= 150;
};
const validateGender = (str) => /^(male|female|other)$/i.test(str);
const validateIndianPhoneNumber = (phone) => {
  return /^(\+91[-\s]?|91)?[6-9]\d{9}$/.test(phone);
};
const validateEmail = (email) => {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
};

const validateInput = (inputData) => {
  const validation = []

  const { name, age, gender, phone, email } = inputData;
  if (!name || !age || !gender) {
    validation.push(validationErros.required);
  }
  if (!validateName(name)) {
    validation.push(validationErros.nameError);
  }
  if (!validateAge(age)) {
    validation.push(validationErros.ageError);
  }
  if (!validateGender(gender)) {
    validation.push(validationErros.genderError);
  }
  if (!validateIndianPhoneNumber(phone)) {
    validation.push(validationErros.phoneError);
  }
  if (!validateEmail(email)) {
    validation.push(validationErros.emailError);
  }
  return validation;
}

/**
 * Register User
 */
exports.handler = async (event) => {
  const message = "Procedure added successfully"
  try {
    let { procedures, details, rate, isDelete  } = JSON.parse(event.body);
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
    const params = {
      TableName: PROCEDURES_TABLE,
      Item: {
        procedureId,
        procedures: procedures.toUpperCase(),
        details,
        rate,
        isDelete,
        "createdBy": "",
        "createdDateTime":  new Date().toISOString(),
        "lastUpdatedTime":  new Date().toISOString()
      },
    };
    await dynamoDB.put(params).promise();
   
    return sendResponse(200, {
      message, data: {
        procedureId
      },
    });
  } catch (error) {
    return sendResponse(500, { message: "Error adding procedures", error: error.message });
  }
};