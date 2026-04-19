const { dynamodb, putItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { generateId } = require('../utils/validations');
const { calculateTotalAmount, updateStockForMedicines } = require('./invoiceUtils');
const { formatDate } = require('../utils');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;
const PATIENTS_TABLE = process.env.PATIENTS_TABLE || `${process.env.stage}PatientsTable`;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const patientId = body.patientId;
    let patientObject = {};
    // Validate required fields
    if (!body.patientId) {
      throw new Error('patientId is required');
    }

    const invoiceId = `INV-${Date.now()}`;
    const now = formatDate(new Date().toISOString());
      if (patientId) {
      const patientResult = await dynamodb.get({
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
    const invoice = {
      invoiceId,
      patientId: patientId,
      patient:  patientObject,
      procedures: body.procedureArray || [],
      medicines: body.medicinesArray || [],
      doctorFee: body.doctorFee || 0,
      paymentStatus: 0, // created
      returnedMedicines: [],
      miscellaneous: body.miscellaneous || [],
      discount: body.discount || 0,
      totalAmount: 0,
      createdDateTime: now,
      lastUpdatedDateTime: now,
      paidAmount: 0,
      balanceAmount: 0,
      onlinePaymentAmount: 0,
      cashPaymentAmount: 0,
      cardPaymentAmount: 0
    };

    // Calculate total amount
    invoice.totalAmount = calculateTotalAmount(invoice);
    invoice.balanceAmount = invoice.totalAmount;

    // Update stock for medicines
    if (invoice.medicines.length > 0) {
      await updateStockForMedicines(invoice.medicines, 'subtract');
    }

    // Save invoice
    await putItem(TABLE_INVOICE, invoice);

    return success(invoice, 201);
  } catch (err) {
    return error(err);
  }
};
