require('dotenv').config();
const AWS = require('aws-sdk');
const { sendResponse } = require('../utils');
// const isOffline = process.env.IS_OFFLINE === 'dev';
const isOffline = true;

const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.aws_region,
     credentials: {
       accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // Optional if aws-cli is configured
       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
     }
   });

const DRUGS_TABLE = process.env.DRUG_TABLE;

/**
 * List Patients
 */
exports.handler = async (event) => {
  const message = "Drugs listed successfully"
  const searchDrug = event.queryStringParameters?.drug;
  const searchDrugType = event.queryStringParameters?.drugType;

  const params = {
      TableName: DRUGS_TABLE,
      FilterExpression: 'contains(drug, :drug) AND drugType = :drugType',
      ExpressionAttributeValues: {
          ':drug': searchDrug?searchDrug.toUpperCase():'',
          ':drugType': searchDrugType
      }
  };

  try {
      const data = await dynamoDB.scan(params).promise();
      const filteredData = data.Items.map(item => {
          return {
              drug: item.drug,
              drugId: item.drugId,
              balanceCount: item.balanceCount,
              drugType: item.drugType,
              stock: item.stock.map(stockItem => {
                  return {
                      tradeName: stockItem.tradeName,
                      expiry: stockItem.expiry.map(expiryItem => {
                          return {
                              expiryDate: expiryItem.expiryDate,
                              count: {
                                  stripCount: expiryItem.count.stripCount,
                                  stripNumber: expiryItem.count.stripNumber,
                                  mrpPerStrip: expiryItem.count.mrpPerStrip,
                                  mrpForPiece: expiryItem.count.mrpForPiece,
                                  balanceExpireCount: expiryItem.count.balanceExpireCount
                              }
                          };
                      })
                  };
              })
          };
      });
      return sendResponse(200, { message: message, data: filteredData });
     
  } catch (error) {
      return sendResponse(500, { message: error.message, error: error });
  }
};