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
 * Soft delete a procedure by setting isDelete = 1
 */
exports.handler = async (event) => {
    const message = "Procedure deleted successfully";
    
    try {
        const { procedureId } = event.pathParameters;
        
        if (!procedureId) {
            return sendResponse(400, { message: "Procedure ID is required" });
        }

        const params = {
            TableName: PROCEDURES_TABLE,
            Key: { procedureId },
            UpdateExpression: 'SET isDelete = :isDelete, lastUpdatedTime = :lastUpdatedTime',
            ExpressionAttributeValues: {
                ':isDelete': 1,
                ':lastUpdatedTime': formatDate(new Date().toISOString())
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        
        return sendResponse(200, { message, data: result.Attributes });
    } catch (error) {
        console.error('Error deleting procedure:', error);
        return sendResponse(500, { message: "Error deleting procedure", error: error.message });
    }
};
