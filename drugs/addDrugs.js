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
     accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // Optional if aws-cli is configured
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
   }
 });

const DRUG_TABLE = process.env.DRUG_TABLE;
const DRUG_GSI = "drug-index";
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
  const message = "Drug added successfully"
  try {
    let { drug, drugType, balanceCount, stock, isDelete  } = JSON.parse(event.body);
    const querParams = {
      TableName: DRUG_TABLE,
      IndexName: DRUG_GSI, // Querying the GSI
      KeyConditionExpression: "drug = :drug",
      ExpressionAttributeValues: {
          ":drug": drug.toUpperCase()
      }
  };

  const existingDrug = await dynamoDB.query(querParams).promise();

  if (existingDrug.Items.length > 0) {
      return sendResponse(400, { message: "Already exists", error: existingDrug });
  }

    const drugId = v4();
    stock = stock.map(item => (
      // console.log(item)
      {
      ...item,
      stockId: v4(),
      tradeName:  item['tradeName'].toUpperCase(),
      vendor: item['vendor'].toUpperCase(),
      stockAddedDate: new Date().toISOString()
    }
  ));
    const params = {
      TableName: DRUG_TABLE,
      Item: {
        drugId,
        drug: drug.toUpperCase(),
        drugType: drugType.toUpperCase(),
        balanceCount,
        stock,
        isDelete,
        "createdBy": "",
        "createdDateTime":  new Date().toISOString(),
        "lastUpdatedTime":  new Date().toISOString()
      },
    };
    await dynamoDB.put(params).promise();
   
    return sendResponse(200, {
      message, data: {
        drugId
      },
    });
  } catch (error) {
    return sendResponse(500, { message: "Error adding drug", error: error.message });
  }
};