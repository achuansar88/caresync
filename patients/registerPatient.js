require('dotenv').config();
const AWS = require('aws-sdk');
const { validationErros } = require('../utils/constants');
const { sendResponse, formatDate } = require('../utils');
const pateintInput = require('../utils/patient.json');

// const isOffline = process.env.IS_OFFLINE === 'dev';

// const dynamoDB = new AWS.DynamoDB.DocumentClient({
//  region: 'ap-south-1',
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // Optional if aws-cli is configured
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   }
// });
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const PATIENTS_TABLE = process.env.PATIENTS_TABLE;
const COUNTER_TABLE = process.env.COUNTER_TABLE;

/**
 * Function to generate auto-incrementing userId
 */
async function getNextPatientId() {
  const params = {
    TableName: COUNTER_TABLE,
    Key: { counterName: "patientIdCounter" },
    UpdateExpression: "SET counterValue = counterValue + :inc",
    ExpressionAttributeValues: { ":inc": 1 },
    ReturnValues: "UPDATED_NEW",
  };

  const result = await dynamoDB.update(params).promise();
  return result.Attributes.counterValue;
}
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
  // if (!validateEmail(email)) {
  //   validation.push(validationErros.emailError);
  // }
  return validation;
}

/**
 * Register User
 */
exports.handler = async (event) => {
  const message = "Patient registered successfully";
  try {
    const { name, age, gender, phone, place, purpose, typeOfTests } = JSON.parse(event.body);
    const errors = validateInput({ name, age, gender, phone });
    if (errors.length > 0) {
      return sendResponse(400, { message: "Error registering user", error: errors.toString() });
    }
    // Get next auto-incremented userId
    const patientId = await getNextPatientId()+100;
    const now = formatDate(new Date().toISOString());
    const params = {
      TableName: PATIENTS_TABLE,
      Item: {
        ...pateintInput, patientId,
        name,
        age,
        gender,
        phone,
        place,
        typeOfTests,
        "createdBy":  event.requestContext.authorizer.lambda,
        "createdDateTime": now,
        "lastVisits": [{visitDateTime: now, purpose}],
      },
    };

    await dynamoDB.put(params).promise();
   
    return sendResponse(200, {
      message, data: {
        patientId
      },
    });
  } catch (error) {

    return sendResponse(500, { message: "Error registering user", error: error.message });
  }
};