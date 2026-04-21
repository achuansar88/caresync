const { dynamodb, putItem, getItem } = require('../utils/db');
const { success, error } = require('../utils/responses');
const { calculateTotalAmount, updateStockForMedicines } = require('./invoiceUtils');
const { formatDate } = require('../utils');

const TABLE_INVOICE = process.env.INVOICE_TABLE || `${process.env.stage}InvoiceTable`;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const updateType = body.updateType || 'edit'; // 'edit' or 'payment' or 'return'
    if (!body.invoiceId) {
      throw new Error('invoiceId is required');
    }

    // fetch existing invoice
    const existing = (await getItem(TABLE_INVOICE, { invoiceId: body.invoiceId }))?.Item;
    if (!existing) {
      throw new Error('Invoice not found');
    }
    // only allow updates when paymentStatus is 0 (unchanged behavior)
    if (updateType === 'edit' && existing.paymentStatus !== 0) {
      throw new Error('Invoice cannot be updated because paymentStatus is not 0');
    } else if (updateType === 'payment' && existing.paymentStatus === 2) {
      throw new Error('Invoice is already fully paid');
    }

    const now = formatDate(new Date().toISOString());
    
    // Helper: compute medicine diffs (assumes items have medicineId and count)
    const computeMedicineDiffs = (oldArr = [], newArr = []) => {
      // helper to sum quantities by medicineId
      const mapQty = (arr) => {
      const m = {};
      for (const it of arr) {
        if (!it || !it.medicineId) continue;
        m[it.medicineId] = (m[it.medicineId] || 0) + (Number(it.count) || 0);
      }
      return m;
      };

      // helper to pick a representative item (prefer first occurrence)
      const repItem = (arr) => {
      const r = {};
      for (const it of arr) {
        if (!it || !it.medicineId) continue;
        if (!r[it.medicineId]) r[it.medicineId] = it;
      }
      return r;
      };

      const oldMap = mapQty(oldArr);
      const newMap = mapQty(newArr);
      const oldRep = repItem(oldArr);
      const newRep = repItem(newArr);

      const diffs = [];
      const allIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
      for (const id of allIds) {
      const oldQ = oldMap[id] || 0;
      const newQ = newMap[id] || 0;
      const diff = newQ - oldQ;
      if (diff !== 0) {
        // prefer fields from new item if present, otherwise fall back to old item
        const src = newRep[id] || oldRep[id] || {};
        // copy common fields and any other existing fields from the representative item
        const { medicineType, stockId, expiryDate, rate, tradeName } = src;
        const extra = {};
        for (const k of Object.keys(src || {})) {
        if (!['medicineId', 'quantity', 'medicineType', 'stockId', 'expiryDate', 'rate', 'tradeName'].includes(k)) {
          extra[k] = src[k];
        }
        }
        diffs.push({
        medicineId: id,
        count: diff,
        medicineType,
        stockId,
        expiryDate,
        rate,
        tradeName,
        ...extra
        });
      }
      }
      return diffs;
    };

    // Start from existing invoice and apply only provided updates
    const invoice = { ...existing };

    // Ensure medicines array exists
    invoice.medicines = Array.isArray(invoice.medicines) ? [...invoice.medicines] : [];

    // Process returned medicines (increase stock and reduce invoice quantities)
    let returnedMedicines = [];
    
    if (Array.isArray(body.returnMedicines) && body.returnMedicines.length > 0) {
      for (const r of body.returnMedicines) {
      if (!r || !r.medicineId) continue;
      const returnQty = Math.max(0, Number(r.quantity) || 0);
      if (returnQty === 0) continue;

      const idx = invoice.medicines.findIndex(m => m.medicineId === r.medicineId);
      console.log('Returned medicines idx:', idx);
      if (idx === -1) {
        // nothing to return from invoice; skip
        continue;
      }

      // support both `count` and `quantity` fields on invoice items
      const item = invoice.medicines[idx];
      const existingQty = Number(item.count ?? item.quantity ?? 0);
      const actualReturn = Math.min(existingQty, returnQty);
      console.log('Processed return for medicineId:', item.medicineId, 'existingQty:', existingQty, 'actualReturn:', actualReturn);
      if (actualReturn <= 0) continue;

      const newQty = existingQty - actualReturn;

      if (newQty > 0) {
        // update counts/quantities and recompute line amount (use rate or price if present)
        const rate = Number(item.rate ?? item.price ?? 0);
        const newAmount = rate * newQty;
        invoice.medicines[idx] = {
        ...item,
        count: newQty,
        quantity: newQty,
        amount: newAmount
        };
      } else {
        // remove the item from invoice
        invoice.medicines.splice(idx, 1);
      }

      returnedMedicines.push({
        medicineName: r.medicineName,
        medicineId: r.medicineId,
        count: actualReturn,
        stockId: r.stockId,
        medicineType: r.medicineType,
        amount: Number(item.rate ?? 0) * actualReturn,
        returnDateTime: now
      });
      }

      // add returned qty back to stock
      if (returnedMedicines.length > 0) {
      await updateStockForMedicines(returnedMedicines, 'add');
      }

      // record returned medicines on invoice
      invoice.returnedMedicines = Array.isArray(invoice.returnedMedicines)
      ? invoice.returnedMedicines.concat(returnedMedicines)
      : returnedMedicines;

      // Recalculate totals and balance after processing returns
      try {
      invoice.totalAmount = calculateTotalAmount(invoice);
      } catch (e) {
      console.warn('Failed to calculate totalAmount after returns:', e);
      invoice.totalAmount = Number(invoice.totalAmount) || 0;
      }
      const paidNow = Number(invoice.paidAmount) || 0;
      const totNow = Number(invoice.totalAmount) || 0;
      invoice.balanceAmount = Math.max(0, totNow - paidNow);
      // paymentStatus will be finalized later in the flow
    }

    // Medicines replacement/update (if provided) - computes diffs and adjusts stock accordingly
    if (Array.isArray(body.medicinesArray)) {
      const oldMedicines = invoice.medicines || [];
      const newMedicines = body.medicinesArray;
      // compute diffs: positive diff means we need to subtract from stock, negative -> add back to stock
      const diffs = computeMedicineDiffs(oldMedicines, newMedicines);
      console.log('Medicine diffs:', diffs);
      // apply stock adjustments per diff
      for (const d of diffs) {
        if (d.count > 0) {
          // reduce stock
          await updateStockForMedicines([{ medicineId: d.medicineId, count: d.count, stockId: d.stockId, medicineType: d.medicineType }], 'subtract');
        } else if (d.count < 0) {
          // increase stock (return)
          await updateStockForMedicines([{ medicineId: d.medicineId, count: -d.count, stockId: d.stockId, medicineType: d.medicineType }], 'add');
        }
      }
      invoice.medicines = newMedicines;
    }

    // Procedures
    if (Array.isArray(body.procedureArray)) {
      invoice.procedures = body.procedureArray;
    }

    // Doctor fee
    if (body.doctorFee !== undefined) {
      invoice.doctorFee = Number(body.doctorFee) || 0;
    }

    // Miscellaneous
    if (Array.isArray(body.miscellaneous)) {
      invoice.miscellaneous = body.miscellaneous;
    }

    // Discount
    if (body.discount !== undefined) {
      invoice.discount = Number(body.discount) || 0;
    }

    // Recalculate totals after any medicine returns/changes
    invoice.totalAmount = calculateTotalAmount(invoice);

    // Handle payments (cardPayment, upiPayment, cashPayment can be provided individually or together)
    // body.paidAmount is the new payment amount for this transaction only
    // body.cashPaymentAmount, body.onlinePaymentAmount, body.cardPaymentAmount are cumulative totals
    const newPaymentAmount = Math.floor(Number(body.paidAmount) || 0);

    // For payment methods, the frontend sends cumulative values
    // So we use them directly instead of adding to existing
    if (newPaymentAmount > 0) {
      invoice.paidAmount = Math.floor(Number(invoice.paidAmount || 0) + newPaymentAmount);
      invoice.cardPaymentAmount = Math.floor(Number(body.cardPaymentAmount) || 0);
      invoice.onlinePaymentAmount = Math.floor(Number(body.onlinePaymentAmount) || 0);
      invoice.cashPaymentAmount = Math.floor(Number(body.cashPaymentAmount) || 0);
    }

    // Compute balance and paymentStatus (round down all amounts)
    const total = Math.floor(Number(invoice.totalAmount) || 0);
    const paid = Math.floor(Number(invoice.paidAmount) || 0);
    let balance = Math.floor(total - paid);
    if (balance <= 0) {
      invoice.balanceAmount = 0;
      invoice.paymentStatus = 2; // fully paid
    } else if (paid > 0) {
      invoice.balanceAmount = Math.floor(balance);
      invoice.paymentStatus = 1; // partial
    } else {
      invoice.balanceAmount = Math.floor(total);
      invoice.paymentStatus = 0; // unpaid
    }

    invoice.lastUpdatedDateTime = now;

    // Persist updated invoice (overwrite)
    await putItem(TABLE_INVOICE, invoice);

    // Return invoice including any returnedMedicines info
    return success(invoice, 200);
  } catch (err) {
    return error(err);
  }
};
