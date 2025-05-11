const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

console.log('orderRoutes.js loaded');

router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('POST /api/orders route hit', { correlationId: req.correlationId });

    // Check authentication
    if (!req.account || !req.account.CustomerID || !req.account.AccountID) {
      logger.warn('Unauthorized order creation attempt', { correlationId: req.correlationId });
      return res.status(401).json({ message: 'Unauthorized: Missing account details' });
    }

    const { items, shippingAddress, paymentMethod } = req.body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      logger.warn('Missing or invalid items', { body: req.body, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Items are required and must be a non-empty array' });
    }
    if (!shippingAddress || typeof shippingAddress !== 'object' || !shippingAddress.address || !shippingAddress.city) {
      logger.warn('Invalid shipping address', { body: req.body, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Shipping address is required with address and city' });
    }
    if (!paymentMethod || !['CreditCard', 'CashOnDelivery', 'BankTransfer'].includes(paymentMethod)) {
      logger.warn('Invalid payment method', { body: req.body, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Payment method is required and must be CreditCard, CashOnDelivery, or BankTransfer' });
    }

    // Validate collections
    if (!collections.productCollection || !collections.productstockCollection || !collections.orderCollection || !collections.orderDetailCollection) {
      logger.error('Collections not initialized', { correlationId: req.correlationId });
      return res.status(500).json({ message: 'Database not initialized' });
    }

    // Fetch products and stock
    const productIDs = items.map(item => item.productId);
    const products = await collections.productCollection
      .find({ ProductID: { $in: productIDs } })
      .toArray();
    const productMap = products.reduce((acc, p) => {
      acc[p.ProductID] = p;
      return acc;
    }, {});

    const stocks = await collections.productstockCollection
      .find({ ProductID: { $in: productIDs } })
      .toArray();
    const stockMap = stocks.reduce((acc, s) => {
      acc[s.ProductID] = s.StockQuantity;
      return acc;
    }, {});

    // Validate items and stock
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        logger.warn('Invalid item format', { item, correlationId: req.correlationId });
        return res.status(400).json({ message: `Invalid item: ${JSON.stringify(item)}` });
      }
      if (!productMap[item.productId]) {
        logger.warn('Product not found', { productId: item.productId, correlationId: req.correlationId });
        return res.status(400).json({ message: `Product ${item.productId} does not exist` });
      }
      if (stockMap[item.productId] === undefined || stockMap[item.productId] < item.quantity) {
        logger.warn('Insufficient stock for product', { productId: item.productId, quantity: item.quantity, stock: stockMap[item.productId], correlationId: req.correlationId });
        return res.status(400).json({ message: `Product ${item.productId} is out of stock or has insufficient quantity` });
      }
    }

    // Create order
    const orderID = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newOrder = {
      OrderID: orderID,
      CustomerID: req.account.CustomerID,
      OrderDate: new Date(),
      ShippingAddress: {
        address: shippingAddress.address,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode || '',
        country: shippingAddress.country || 'Vietnam'
      },
      PaymentMethod: paymentMethod,
      Status: 'Pending',
      TotalAmount: items.reduce((sum, item) => sum + (productMap[item.productId].ProductPrice * item.quantity), 0)
    };

    // Atomic stock update and order creation
    const session = collections.productCollection.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Insert order
        await collections.orderCollection.insertOne(newOrder, { session });

        // Insert order details
        const orderDetails = items.map(item => ({
          OrderID: orderID,
          ProductID: item.productId,
          Quantity: item.quantity,
          Price: productMap[item.productId].ProductPrice
        }));
        await collections.orderDetailCollection.insertMany(orderDetails, { session });

        // Update stock atomically
        for (const item of items) {
          const updateResult = await collections.productstockCollection.updateOne(
            { ProductID: item.productId, StockQuantity: { $gte: item.quantity } },
            { $inc: { StockQuantity: -item.quantity } },
            { session }
          );
          if (updateResult.matchedCount === 0) {
            throw new Error(`Stock update failed for product ${item.productId}: insufficient stock or product not found`);
          }
        }
      });
    } finally {
      await session.endSession();
    }

    // Clear cart (assume cartCollection is defined in db.js)
    if (collections.cartCollection) {
      await collections.cartCollection.deleteOne({ AccountID: req.account.AccountID });
    } else {
      logger.warn('cartCollection not initialized, skipping cart deletion', { correlationId: req.correlationId });
    }

    logger.info('Order created successfully', { orderId: orderID, customerId: req.account.CustomerID, correlationId: req.correlationId });
    res.status(201).json({ message: 'Order created successfully', order: newOrder });
  } catch (err) {
    logger.error('Error in POST /orders', { error: err.message, stack: err.stack, correlationId: req.correlationId });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('GET /api/orders route hit', { correlationId: req.correlationId });

    // Check authentication
    if (!req.account || !req.account.CustomerID) {
      logger.warn('Unauthorized order access attempt', { correlationId: req.correlationId });
      return res.status(401).json({ message: 'Unauthorized: Missing account details' });
    }

    // Validate collections
    if (!collections.orderCollection || !collections.orderDetailCollection || !collections.productCollection) {
      logger.error('Collections not initialized', { correlationId: req.correlationId });
      return res.status(500).json({ message: 'Database not initialized' });
    }

    // Fetch orders
    const orders = await collections.orderCollection
      .find({ CustomerID: req.account.CustomerID })
      .sort({ OrderDate: -1 })
      .toArray();

    if (!orders.length) {
      logger.info('No orders found', { customerId: req.account.CustomerID, correlationId: req.correlationId });
      return res.status(200).json([]);
    }

    // Fetch order details
    const orderIDs = orders.map(order => order.OrderID);
    const orderDetails = await collections.orderDetailCollection
      .find({ OrderID: { $in: orderIDs } })
      .toArray();

    // Fetch products
    const productIDs = [...new Set(orderDetails.map(detail => detail.ProductID))];
    const products = await collections.productCollection
      .find({ ProductID: { $in: productIDs } })
      .toArray();
    const productMap = products.reduce((acc, p) => {
      acc[p.ProductID] = p;
      return acc;
    }, {});

    // Combine orders with details
    const ordersWithDetails = orders.map(order => ({
      ...order,
      _id: order._id.toHexString(),
      items: orderDetails
        .filter(detail => detail.OrderID === order.OrderID)
        .map(detail => ({
          productId: detail.ProductID,
          quantity: detail.Quantity,
          price: detail.Price,
          productName: productMap[detail.ProductID]?.ProductName || 'Unknown'
        }))
    }));

    logger.info('Fetched orders successfully', { customerId: req.account.CustomerID, count: orders.length, correlationId: req.correlationId });
    res.status(200).json(ordersWithDetails);
  } catch (err) {
    logger.error('Error in GET /orders', { error: err.message, stack: err.stack, correlationId: req.correlationId });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;