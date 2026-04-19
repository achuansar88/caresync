// Lambda to confirm a patient procedure, set status=1, set confirmationDateTime, update stocks
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.PATIENT_PROCEDURE_TABLE || `${process.env.stage || 'dev'}PatientProcedureTable`;
const PROCEDURES_TABLE = process.env.PROCEDURES_TABLE || `${process.env.stage || 'dev'}ProceduresTable`;
const INVOICE_TABLE = `${process.env.stage || 'dev'}InvoiceTable`;
const { getStockTableName } = require('../utils/db');
const { formatDate } = require('../utils');

exports.handler = async (event) => {
  try {
    
    const patientProcedureId = event.pathParameters && event.pathParameters.patientProcedureId;

    // Fetch current item
    const { Item } = await docClient.get({ TableName: TABLE, Key: { patientProcedureId } }).promise();
    if (!Item) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
    if (Item.status === 1) return { statusCode: 400, body: JSON.stringify({ message: 'Already confirmed' }) };
    const { procedure, requirements, patientId, procedureId } = Item;
    const procedures = (await docClient.get({ TableName: PROCEDURES_TABLE, Key: { procedureId } }).promise())?.Item || null;

    const PATIENTS_TABLE = process.env.PATIENTS_TABLE || `${process.env.stage || 'dev'}PatientsTable`;
    let patientObject = null;
    if (patientId) {
      const patientResult = await docClient.get({
      TableName: PATIENTS_TABLE,
      Key: { patientId: parseInt(patientId) }
      }).promise();
      const patientItem = patientResult?.Item || null;
      if (patientItem) {
      patientObject = {
        patientId: patientItem.patientId || patientId,
        patientName: patientItem.name || patientItem.fullName || '',
        age: patientItem.age ?? null,
        phoneNumber: patientItem.phoneNumber || patientItem.mobile || '',
        gender: patientItem.gender || ''
      };
      }
    }

    // Update status and confirmationDateTime
    const confirmationDateTime = formatDate(new Date().toISOString());
    await docClient.update({
      TableName: TABLE,
      Key: { patientProcedureId },
      UpdateExpression: 'SET #s = :s, #c = :c',
      ExpressionAttributeNames: { '#s': 'status', '#c': 'confirmationDateTime' },
      ExpressionAttributeValues: { ':s': 1, ':c': confirmationDateTime },
    }).promise();

    let totalAmount = 0;
    // If a procedure record was fetched, use its fixed rate and prevent later updates from requirements
    const useProcedureRate = !!procedures;
    if (useProcedureRate) {
      totalAmount = Number(procedures.rate || 0);
    }
    // const procedureDetails = [];
    const stockUpdates = [];
    // Process requirements if provided
    if (requirements && Array.isArray(requirements)) {
      for (const med of requirements) {
        const { medicineId, medicineType, quantity } = med;
        if (!medicineId || !medicineType || !quantity) continue;

        const stockTable = getStockTableName(medicineType);
        
        // Find available stocks with balanceQuantity > 0, ordered by expiryDate (oldest first)
        const stockQuery = {
          TableName: stockTable,
          IndexName: 'medicineId-index',
          KeyConditionExpression: 'medicineId = :medicineId',
          FilterExpression: 'balanceQuantity > :zero',
          ExpressionAttributeValues: {
            ':medicineId': medicineId,
            ':zero': 0
          },
          ScanIndexForward: true // Ascending order (oldest expiry first)
        };

        const stockResult = await docClient.query(stockQuery).promise();
        const availableStocks = stockResult.Items || [];

        if (availableStocks.length === 0) {
          return { statusCode: 400, body: JSON.stringify({ message: `No stock available for medicineId: ${medicineId}` }) };
        }

        let remainingQuantity = quantity;
        const stocksToUse = [];
        let totalMRP = 0;

        // Find stocks to fulfill the requirement
        for (const stock of availableStocks) {
          if (remainingQuantity <= 0) break;

          const availableQty = Math.min(stock.balanceQuantity, remainingQuantity);
          stocksToUse.push({
            stockId: stock.stockId,
            quantityUsed: availableQty,
            mrpPerUnit: stock.mrpPerItem || stock.mrpPerBottle || stock.mrpPerDrop || stock.mrpPerRespule || stock.mrpPerInjections || stock.mrpPerTube || stock.mrpPerPiece || stock.mrpPerFluid || 0
          });

          totalMRP += availableQty * (stock.mrpPerItem || stock.mrpPerBottle || stock.mrpPerDrop || stock.mrpPerRespule || stock.mrpPerInjections || stock.mrpPerTube || stock.mrpPerPiece || stock.mrpPerFluid || 0);
          remainingQuantity -= availableQty;
        }

        if (remainingQuantity > 0) {
          return { statusCode: 400, body: JSON.stringify({ message: `Insufficient stock for medicineId: ${medicineId}. Required: ${quantity}, Available: ${quantity - remainingQuantity}` }) };
        }

        // Update stocks and medicine balance
        for (const stockUsage of stocksToUse) {
          await docClient.update({
            TableName: stockTable,
            Key: { stockId: stockUsage.stockId },
            UpdateExpression: 'SET balanceQuantity = balanceQuantity - :q',
            ExpressionAttributeValues: { ':q': stockUsage.quantityUsed },
            ConditionExpression: 'balanceQuantity >= :q'
          }).promise();

          stockUpdates.push({
            stockId: stockUsage.stockId,
            quantityUsed: stockUsage.quantityUsed,
            medicineId,
            medicineType
          });
        }

        // Update medicine balance quantity
        await docClient.update({
          TableName: process.env.MEDICINE_TABLE,
          Key: { medicineId },
          UpdateExpression: 'SET balanceQuantity = balanceQuantity - :q, lastUpdatedDateTime = :now',
          ExpressionAttributeValues: {
            ':q': quantity,
            ':now': formatDate(new Date().toISOString())
          }
        }).promise();

        // procedureDetails.push({
        //   procedureId: procedure.procedureId,
        //   procedureName: procedure.procedureName,
        //   medicineId,
        //   medicineType,
        //   quantity,
        //   totalMRP: totalMRP
        // });

        if (!useProcedureRate) {
          totalAmount += totalMRP;
        }
      }
    }

    // Handle invoice creation/update
    const now = formatDate(new Date().toISOString());
    const invoiceId = `INV-${Date.now()}`;

    // Check for existing unpaid invoice for this user
    const existingInvoiceQuery = {
      TableName: INVOICE_TABLE,
      IndexName: 'patientId-index',
      KeyConditionExpression: 'patientId = :pId',
      FilterExpression: 'paymentStatus = :pStatus',
      ExpressionAttributeValues: {
        ':pId': patientId,
        ':pStatus': 0
      }
    };
    const existingInvoices = await docClient.query(existingInvoiceQuery).promise();
    function buildInvoiceProcedures(totalAmount, proceduresRecord, patientProcedure) {
        const invoiceProcedures = [];

        if (proceduresRecord) {
          invoiceProcedures.push({
            procedureId: proceduresRecord.procedureId,
            procedureName: proceduresRecord.procedures,
            quantity: 1,
            amount: Number(proceduresRecord.rate || totalAmount)
          });
        } else {
          const procName = typeof patientProcedure === 'string'
            ? patientProcedure
            : (patientProcedure || 'Unknown');

          invoiceProcedures.push({
            procedureId: (patientProcedure && patientProcedure.procedureId) || '0',
            procedureName: procName,
            quantity: 1,
            amount: Number(totalAmount)
          });
        }

        return invoiceProcedures;
      }
    const invoiceProcedures = buildInvoiceProcedures(totalAmount, procedures, procedure);
    if (existingInvoices.Items && existingInvoices.Items.length > 0) {
      // Update existing invoice
      const existingInvoice = existingInvoices.Items[0];
      const updatedProcedures = [...(existingInvoice.procedures || []), ...invoiceProcedures];
      const updatedTotal = (existingInvoice.totalAmount || 0) + totalAmount;
      const updatedBalance = (existingInvoice.balanceAmount || 0) + totalAmount;
      console.log('updateTotal', updatedTotal, 'updatedBalance', updatedBalance);

      await docClient.update({
        TableName: INVOICE_TABLE,
        Key: { invoiceId: existingInvoice.invoiceId },
        UpdateExpression: 'SET procedures = :procedures, totalAmount = :totalAmount, balanceAmount = :balanceAmount, lastUpdated = :now',
        ExpressionAttributeValues: {
          ':procedures': updatedProcedures,
          ':totalAmount': updatedTotal,
          ':balanceAmount': updatedBalance,
          ':now': now
        }
      }).promise();
    } else {
      const invoiceItem = {
        invoiceId,
        patientId,
        patient: patientObject,
        procedures: invoiceProcedures,
        totalAmount: totalAmount,
        paidAmount: 0,
        balanceAmount: totalAmount,
        onlinePaymentAmount: 0,
        cashPaymentAmount: 0,
        cardPaymentAmount: 0,
        paymentStatus: 0,
        createdDateTime: now,
        lastUpdated: now
      };

      await docClient.put({
        TableName: INVOICE_TABLE,
        Item: invoiceItem
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Confirmed',
        confirmationDateTime,
        totalAmount,
        stockUpdates
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
