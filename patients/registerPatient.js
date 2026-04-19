require('dotenv').config();
const AWS = require('aws-sdk');
const { validationErros } = require('../utils/constants');
const { sendResponse, formatDate } = require('../utils');
const pateintInput = require('../utils/patient.json');

// const isOffline = process.env.IS_OFFLINE === 'dev';

// const dynamoDB = new AWS.DynamoDB.DocumentClient({
//  region: 'ap-south-1',
//   credentials: {
//     accessKeyId: process.env.AWS_ACC,   // Optional if aws-cli is configured
//     secretAccessKey: process.env.AWS_SECR,
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
  if (!validateName(name.trim())) {
    validation.push(validationErros.nameError);
  }
  if (!validateAge(age.trim())) {
    validation.push(validationErros.ageError);
  }
  if (!validateGender(gender.trim())) {
    validation.push(validationErros.genderError);
  }
  if (!validateIndianPhoneNumber(phone.trim())) {
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
const  trimStrings = (input) => {
  const result = {};
  for (const key in input) {
    result[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
  }
  return result;
}
exports.handler = async (event) => {
  const message = "Patient registered successfully";
  try {
    let input = JSON.parse(event.body);
    input = trimStrings(input);
    const { name, age, gender, phone, place, purpose } = input;
    const errors = validateInput({ name, age, gender, phone });
    if (errors.length > 0) {
      return sendResponse(400, { message: "Error registering user", error: errors.toString() });
    }

    const nameLower = name.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    // Check if patient already exists
    const existingPatient = await dynamoDB.query({
      TableName: PATIENTS_TABLE,
      IndexName: 'patientnamelowerphone-index', // GSI with nameLower (PK), phone (SK)
      KeyConditionExpression: 'nameLower = :name AND phone = :phone',
      ExpressionAttributeValues: {
        ':name': nameLower,
        ':phone': trimmedPhone,
      },
    }).promise();

    if (existingPatient.Items && existingPatient.Items.length > 0) {
      return sendResponse(200, {
        message: "Patient already exists",
        data: {
          patientId: existingPatient.Items[0].patientId,
          name: existingPatient.Items[0].name,
          age: existingPatient.Items[0].age,
          gender: existingPatient.Items[0].gender,
          place: existingPatient.Items[0].place,
          phone: existingPatient.Items[0].phone,
        },
      });
    }
    // Get next auto-incremented userId
    const patientId = await getNextPatientId()+100;
    const now = formatDate(new Date().toISOString());
    const params = {
      TableName: PATIENTS_TABLE,
      Item: {
        ...pateintInput, patientId,
        name,
        nameLower: name.toLowerCase(),
        age,
        gender,
        phone,
        place,
        patientName: 'all',
        "createdBy":  event.requestContext.authorizer.lambda,
        "createdDateTime": now,
        "lastVisitedDateTime": now,
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

// exports.handler = async () => {
//   let lastEvaluatedKey = null;
//   let updatedCount = 0;

//   try {
//     do {
//       const scanParams = {
//         TableName: PATIENTS_TABLE,
//         ProjectionExpression: 'patientId, #name, nameLower',
//         ExpressionAttributeNames: {
//           '#name': 'name',
//         },
//         ExclusiveStartKey: lastEvaluatedKey || undefined,
//       };

//       const data = await dynamoDB.scan(scanParams).promise();

//       for (const item of data.Items) {
//         const correctLower = item.name?.toLowerCase() || '';

//         if (!item.nameLower || item.nameLower !== correctLower) {
//           const updateParams = {
//             TableName: PATIENTS_TABLE,
//             Key: { patientId: item.patientId },
//             UpdateExpression: 'SET nameLower = :nameLower',
//             ExpressionAttributeValues: {
//               ':nameLower': correctLower,
//             },
//           };

//           await dynamoDB.update(updateParams).promise();
//           updatedCount++;
//         }
//       }

//       lastEvaluatedKey = data.LastEvaluatedKey;
//     } while (lastEvaluatedKey);

//     return {
//       statusCode: 200,
//       body: JSON.stringify({ message: `Updated ${updatedCount} patients with nameLower.` }),
//     };
//   } catch (error) {
//     console.error('Error updating patients:', error);
//     return {
//       statusCode: 500,
//       body: JSON.stringify({ error: error.message }),
//     };
//   }
// };