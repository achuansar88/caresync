// handler.js
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB.DocumentClient();
const { sendResponse, formatDate } = require('../utils');

const LABTESTS_TABLE = process.env.LABTESTS_TABLE;
const PATIENT_LABTESTS_TABLE = process.env.PATIENT_LABTESTS_TABLE;
const LABTEST_RESULTS_TABLE = process.env.LABTEST_RESULTS_TABLE;

const LABTESTS_GSI = "testName-index";
const LABTEST_RESULTS_GSI = "patientLabTestsId-index";
const PATIENTID_GSI = "patientId-index";
module.exports.addLabTest = async (event) => {

  const { testName, resultParams, rate } = JSON.parse(event.body);
  const labTestsId = uuidv4();
  const message = "Lab test added successfully."
  const item = {
    labTestsId,
    testName: testName.toUpperCase(),
    resultParams,
    rate,
  };
  try {

    const querParams = {
      TableName: LABTESTS_TABLE,
      IndexName: LABTESTS_GSI,
      KeyConditionExpression: "testName = :testName",
      ExpressionAttributeValues: {
        ":testName": testName.toUpperCase()
      }
    };

    const existingTestName = await dynamo.query(querParams).promise();

    if (existingTestName.Items.length > 0) {
      return sendResponse(400, { message: "Already exists", error: existingTestName });
    }

    await dynamo.put({
      TableName: LABTESTS_TABLE,
      Item: item,
    }).promise();
  } catch (error) {
    return sendResponse(500, { message: "Error adding test", error: error.message });
  }

  return sendResponse(201, {
    message, data: item
  });
};

module.exports.getLabTests = async (event) => {
  const searchParam = event.queryStringParameters?.param;
  const params = {
    TableName: LABTESTS_TABLE,
    FilterExpression: 'contains(testName, :testName)',
    ExpressionAttributeValues: {
      ':testName': searchParam ? searchParam.toUpperCase() : '',
    }
  };

  const result = await dynamo.scan(params).promise();
  let items = result.Items;

  return sendResponse(200, {message: "Lab tests list", data: items});
};

module.exports.updateLabTest = async (event) => {
  const labTestsId = event.pathParameters.id;
  const body = JSON.parse(event.body);
  await dynamo.update({
    TableName: LABTESTS_TABLE,
    Key: { labTestsId },
    UpdateExpression: "set testName = :testName, resultParams = :resultParams, rate = :rate",
    ExpressionAttributeValues: {
      ":testName": body.testName,
      ":resultParams": body.resultParams,
      ":rate": body.rate,
    },
  }).promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Updated" }),
  };
};

module.exports.deletePatientLabTest = async (event) => {

  const { patientLabTestsId } = event.pathParameters;

  const params = {
    TableName: TABLE_NAME,
    Key: {
      patientLabTestsId,
    },
    ConditionExpression: '#status = :pending AND #paymentStatus = :pending',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#paymentStatus': 'paymentStatus',
    },
    ExpressionAttributeValues: {
      ':pending': 'pending',
    },
  };

  try {
    await dynamo.delete(params).promise();
    return sendResponse(200, {message: "Deleted successfully"});
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return sendResponse(400, {message: "Deletion failed"});      
    }
    return sendResponse(500, {message: "Internal Server Error"});
   
  }
};

module.exports.assignLabTestToPatient = async (event) => {
  const { patientId, tests } = JSON.parse(event.body);

  const labtests = tests || []; // This should be an array like ['1', '2', '3']

  if (!Array.isArray(labtests) || labtests.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Tests are required' }),
    };
  }

  const requestItems = {
    RequestItems: {
      [LABTESTS_TABLE]: {
        Keys: labtests.map((test) => ({ labTestsId: test.labTestsId, testName: test.testName }))
      }
    }
  };

  const labTestResult = await dynamo.batchGet(requestItems).promise();

  

  if (labTestResult?.Responses[LABTESTS_TABLE] && labTestResult?.Responses[LABTESTS_TABLE].length > 0) {
    const selectedLatbTests = labTestResult.Responses[LABTESTS_TABLE];

    const patientLabTestsId = uuidv4();

    const mergedTests = tests.map(test => {
      const fullTest = selectedLatbTests.find(f => f.labTestsId === test.labTestsId);
      return {
        ...test,
        rate: fullTest?.rate ?? null // fallback to null if not found
      };
    });
    const item = {
      patientLabTestsId,
      tests : mergedTests,
      patientId: patientId.toString(),
      dateTime: formatDate(new Date().toISOString()),
      totalAmount: selectedLatbTests.reduce((sum, test) => sum + test.rate, 0),
      paymentStatus: "pending",
      status: "pending",
    };
    await dynamo.put({
      TableName: PATIENT_LABTESTS_TABLE,
      Item: item,
    }).promise();
    return sendResponse(201, { message: "Tests Assigned", data: item });

  } else {
    return sendResponse(400, { message: "Tests Assigning failed", error: "No tests found" });
  }

};

module.exports.confirmPatientLabTests = async (event) => {

  const { patientLabTestsId, paymentStatus, discount, paidRate } = JSON.parse(event.body);
  const querParams = {
    TableName: PATIENT_LABTESTS_TABLE,
    KeyConditionExpression: "patientLabTestsId = :patientLabTestsId",
    ExpressionAttributeValues: {
      ":patientLabTestsId": patientLabTestsId
    }
  };

  const resultLabTest = await dynamo.query(querParams).promise();
  let labTests = resultLabTest.Items[0].tests;
  const requestItems = {
    RequestItems: {
      [LABTESTS_TABLE]: {
        Keys: labTests.map((test) => ({ labTestsId: test.labTestsId, testName: test.testName }))
      }
    }
  };

  const paidARateCalculated = resultLabTest.Items[0].totalAmount - discount;
  if(paidARateCalculated === paidRate) {
    const labTestResult = await dynamo.batchGet(requestItems).promise();

  if (labTestResult?.Responses[LABTESTS_TABLE] && labTestResult?.Responses[LABTESTS_TABLE].length > 0) {
    const selectedLatbTests = labTestResult.Responses[LABTESTS_TABLE];

    const updateStatus = await dynamo.update({
      TableName: PATIENT_LABTESTS_TABLE,
      Key: { patientLabTestsId },
      UpdateExpression: "set paymentStatus = :paymentStatus, #status = :s, discount = :d, paidRate = :pr",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":paymentStatus": paymentStatus,
        ":s": 'ready',
        ":d": discount,
        ":pr": paidRate
      },
      ReturnValues: "ALL_NEW"
    }).promise();

    if (Object.keys(updateStatus?.Attributes).length !== 0) {

      const resultCheckParams = {
        TableName: LABTEST_RESULTS_TABLE,
        IndexName: LABTEST_RESULTS_GSI,
        KeyConditionExpression: 'patientLabTestsId = :v',
        ExpressionAttributeValues: {
          ':v': patientLabTestsId
        }
      };

      const resultCheck = await dynamo.query(resultCheckParams).promise();

      if (resultCheck.Count == 0) {
        const labTestResultsId = uuidv4();

        const labResult = selectedLatbTests.map(test => ({
          testName: test.testName,
          resultParams: test.resultParams.map(param => ({
            ...param,
            value: "",
            updateddateTime: ""
          }))
        }));
        const labResultItem = {
          labTestResultsId,
          patientLabTestsId,
          dateTime: formatDate(new Date().toISOString()),
          labResult,
          status: "pending",
        };
        await dynamo.put({
          TableName: LABTEST_RESULTS_TABLE,
          Item: labResultItem,
        }).promise();
        return sendResponse(200, { message: "Payment status updated", data: labResultItem.status  });
      } else {
        return sendResponse(200, { message: "Payment status updated", data: "Payment status updated"  });
      }
      
    } else {
      return sendResponse(400, { message: "Payment status not updated", error: "Payment status not updated"  });
    }
    
  } else {
    return sendResponse(400, { message: "Sorry mimatch in payment", error: "Mimatch in payment" });
  }
  }
  
  return sendResponse(400, { message: "No tests found", error: "No teest found" });
}

const getStatus = (resultParams) => {
  const total = resultParams.length;
  const filled = resultParams.filter(p => p.value && p.value.trim() !== "").length;

  if (filled === 0) return "pending";
  if (filled === total) return "complete";
  return "inprogress";
};

const getOverallStatus = (labResult) => {
  const statuses = labResult.map(test => test.status);

  if (statuses.every(status => status === "complete")) {
    return "complete";
  } else if (statuses.some(status => status === "inprogress")) {
    return "inprogress";
  } else if (statuses.every(status => status === "pending")) {
    return "pending";
  } else {
    // Mixed statuses (like some complete, some pending)
    return "inprogress";
  }
};

module.exports.updateLabTestResult = async (event) => {
  const { labTestResultsId, testName, labResults, updatedBy, patientLabTestsId } = JSON.parse(event.body);

  const resultCheckParams = {
    TableName: LABTEST_RESULTS_TABLE,
    KeyConditionExpression: 'labTestResultsId = :v',
    ExpressionAttributeValues: {
      ':v': labTestResultsId
    }
  };

  const resultCheck = await dynamo.query(resultCheckParams).promise();
  
  const labSavedResult = resultCheck.Items[0];
  const now = formatDate(new Date().toISOString());

  labResults.forEach(labResult => {
    const savedLabResult = labSavedResult.labResult.find(t => t.testName === labResult.testName);
    if (savedLabResult) {
      labResult.resultParams.forEach(param2 => {
        const param1 = savedLabResult.resultParams.find(p => p.param === param2.param);
        if (param1 && (!param1.value || param1.value.trim() === "") && param2.value && param2.value.trim() !== "") {
          param1.value = param2.value;
          param1.updateddateTime = now;
        }
      });
  
      // After merging each test, update the status
      savedLabResult.status = getStatus(savedLabResult.resultParams);
    }
  });

  // const updatedDate = labResults.map(test => {
  //   const updatedParams = test.resultParams.map(param => {
  //     if (param.value && param.value.trim() !== "" &&  param.updateddateTime == "") {
  //       return {
  //         ...param,
  //         updateddateTime: formatDate(new Date().toISOString())
  //       };
  //     }
  //     return param;
  //   });
  
  //   return {
  //     ...test,
  //     resultParams: updatedParams,
  //     status: getStatus(updatedParams)
  //   };
  // });

  // const updatedTests = labResults.map(test => ({
  //   ...test,
  //   status: getStatus(test.resultParams)
  // }));

  // const overallStatus = getOverallStatus(data.labResult);
  labSavedResult.status = getOverallStatus(labSavedResult.labResult);
  // const item = {
  //   labTestResultsId,
  //   patientLabTestsId,
  //   labResult: labSavedResult.labResult,
  //   dateTime: now,
  //   status: getOverallStatus(labSavedResult.labResult)
  // };

  // await dynamo.put({
  //   TableName: process.env.LABTEST_RESULTS_TABLE,
  //   Item: item,
  // }).promise();

  const updateStatus = await dynamo.update({
    TableName: LABTEST_RESULTS_TABLE,
    Key: { labTestResultsId },
    UpdateExpression: "set labResult = :labResult, #dateTime= :dT,  #status = :s",
    ExpressionAttributeNames: {
      "#status": "status",
      "#dateTime":"dateTime"
    },
    ExpressionAttributeValues: {
      ":labResult": labSavedResult.labResult,
      ":dT": now,
      ":s": labSavedResult.status
    },
    ReturnValues: "ALL_NEW"
  }).promise();
  
  if(labSavedResult.status === "inprogress" || labSavedResult.status === "complete") {

    await dynamo.update({
      TableName: PATIENT_LABTESTS_TABLE,
      Key: { patientLabTestsId },
      UpdateExpression: "set #status = :s",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":s": labSavedResult.status
      },
      // ReturnValues: "ALL_NEW"
    }).promise();

  }

  return sendResponse(200, {message: "Result", data: updateStatus });
};

module.exports.getPatientLabTests = async (event) => {
  const { patientId } = event.pathParameters;

  const querParams = {
    TableName: PATIENT_LABTESTS_TABLE,
    IndexName: PATIENTID_GSI,
    KeyConditionExpression: "patientId = :patientId",
    ExpressionAttributeValues: {
      ":patientId": patientId
    }
  };

  const patientTestsData = await dynamo.query(querParams).promise();

  // const resultCheckParams = {
  //   TableName: LABTEST_RESULTS_TABLE,
  //   IndexName: LABTEST_RESULTS_GSI,
  //   KeyConditionExpression: 'patientLabTestsId = :v',
  //   ExpressionAttributeValues: {
  //     ':v': result.Items[0].patientLabTestsId
  //   }
  // };

  // const resultCheck = await dynamo.query(resultCheckParams).promise();
  

  const mergedResults = await Promise.all(
    patientTestsData.Items.map(async (item) => {
      if (item.status === 'inprogress' || item.status === 'complete') {
        // Step 2: Query lab results
        const labResultData = await dynamo.query({
          TableName: LABTEST_RESULTS_TABLE,
          IndexName: LABTEST_RESULTS_GSI, // Optional: if you use a GSI
          KeyConditionExpression: 'patientLabTestsId = :id',
          ExpressionAttributeValues: {
            ':id': item.patientLabTestsId
          }
        }).promise();

        const labResults = labResultData.Items?.[0]?.labResult || [];

        // Step 3: Merge labResult into matching testName in item.tests
        const mergedTests = item.tests.map((test) => {
          const matchingResult = labResults.find(r => r.testName === test.testName);
          return {
            ...test,
            ...(matchingResult ? {
              resultParams: matchingResult.resultParams,
              status: matchingResult.status
            } : {})
          };
        });

        return {
          ...item,
          tests: mergedTests
        };
      }

      // For pending, just return original
      return item;
    })
  );

  return sendResponse(200, {meessage: "Lab test reoprts", data: mergedResults});
};

module.exports.getLabTestDetails = async (event) => {
  const { patientLabTestsId } = event.pathParameters;

  const querParams = {
    TableName: PATIENT_LABTESTS_TABLE,
    KeyConditionExpression: "patientLabTestsId = :patientLabTestsId",
    ExpressionAttributeValues: {
      ":patientLabTestsId": patientLabTestsId
    }
  };

  const patientTestsData = await dynamo.query(querParams).promise();

  // const resultCheckParams = {
  //   TableName: LABTEST_RESULTS_TABLE,
  //   IndexName: LABTEST_RESULTS_GSI,
  //   KeyConditionExpression: 'patientLabTestsId = :v',
  //   ExpressionAttributeValues: {
  //     ':v': result.Items[0].patientLabTestsId
  //   }
  // };

  // const resultCheck = await dynamo.query(resultCheckParams).promise();
  

  const mergedResults = await Promise.all(
    patientTestsData.Items.map(async (item) => {
      if (item.status === 'inprogress' || item.status === 'complete' || item.status === 'ready') {
        // Step 2: Query lab results
        const labResultData = await dynamo.query({
          TableName: LABTEST_RESULTS_TABLE,
          IndexName: LABTEST_RESULTS_GSI, // Optional: if you use a GSI
          KeyConditionExpression: 'patientLabTestsId = :id',
          ExpressionAttributeValues: {
            ':id': item.patientLabTestsId
          }
        }).promise();

        const labResults = labResultData.Items?.[0]?.labResult || [];

        // Step 3: Merge labResult into matching testName in item.tests
        const mergedTests = item.tests.map((test) => {
          const matchingResult = labResults.find(r => r.testName === test.testName);
          return {
            ...test,
            ...(matchingResult ? {
              resultParams: matchingResult.resultParams,
              status: matchingResult.status
            } : {})
          };
        });

        return {
          labTestResultsId: labResultData.Items?.[0].labTestResultsId,
          ...item,
          tests: mergedTests
        };
      }
      // For pending, just return original
      return item;
    })
  );

  return sendResponse(200, {message: "Lab test reoprts", data: mergedResults});
};
