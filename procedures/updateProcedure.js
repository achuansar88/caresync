require('dotenv').config();
const AWS = require('aws-sdk');
const { sendResponse, formatDate } = require('../utils');

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.aws_region,
    credentials: {
        accessKeyId: process.env.AWS_ACC,
        secretAccessKey: process.env.AWS_SECR
    }
});

const PROCEDURES_TABLE = process.env.PROCEDURES_TABLE;

/**
 * Update a procedure's details
 */
exports.handler = async (event) => {
    const message = "Procedure updated successfully";
    
    try {
        const { procedureId } = event.pathParameters;
        const { procedures, details, rate, requirements } = JSON.parse(event.body);
        
        if (!procedureId) {
            return sendResponse(400, { message: "Procedure ID is required" });
        }

        // Build update expression dynamically based on provided fields
        const updateExpressions = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};

        if (procedures !== undefined) {
            updateExpressions.push('#proc = :procedures');
            expressionAttributeNames['#proc'] = 'procedures';
            expressionAttributeValues[':procedures'] = procedures.toUpperCase();
        }
        
        if (details !== undefined) {
            updateExpressions.push('details = :details');
            expressionAttributeValues[':details'] = details;
        }
        
        if (rate !== undefined) {
            updateExpressions.push('rate = :rate');
            expressionAttributeValues[':rate'] = rate;
        }
        
        if (requirements !== undefined) {
            updateExpressions.push('requirements = :requirements');
            expressionAttributeValues[':requirements'] = requirements;
        }

        updateExpressions.push('lastUpdatedTime = :lastUpdatedTime');
        expressionAttributeValues[':lastUpdatedTime'] = formatDate(new Date().toISOString());

        const params = {
            TableName: PROCEDURES_TABLE,
            Key: { procedureId },
            UpdateExpression: 'SET ' + updateExpressions.join(', '),
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };

        // Add expression attribute names if needed
        if (Object.keys(expressionAttributeNames).length > 0) {
            params.ExpressionAttributeNames = expressionAttributeNames;
        }

        const result = await dynamoDB.update(params).promise();
        
        return sendResponse(200, { message, data: result.Attributes });
    } catch (error) {
        console.error('Error updating procedure:', error);
        return sendResponse(500, { message: "Error updating procedure", error: error.message });
    }
};
