const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized order creation attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { items, shippingAddress, paymentMethod } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0 || !shippingAddress || !paymentMethod) {
    logger.warn('Missing required fields for order creation', { body: req.body, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
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

    for (const item of items) {
      if (!productMap[item.productId] || stockMap[item.productId] < item.quantity) {
        logger.warn('Invalid or insufficient stock for product', { productId: item.productId, correlationId: req.correlationId });
        return res.status(400).json({ message: `Product ${item.productId} is out of stock or invalid` });
      }
    }

    const orderID = `order_${Date.now()}`;
    const newOrder = {
      OrderID: orderID,
      CustomerID: req.account.CustomerID,
      OrderDate: new Date(),
      ShippingAddress: shippingAddress,
      PaymentMethod: paymentMethod,
      Status: 'Pending',
      TotalAmount: items.reduce((sum, item) => sum + (productMap[item.productId].ProductPrice * item.quantity), 0)
    };
    await collections.orderCollection.insertOne(newOrder);

    const orderDetails = items.map(item => ({
      OrderID: orderID,
      ProductID: item.productId,
      Quantity: item.quantity,
      Price: productMap[item.productId].ProductPrice
    }));
    await collections.orderDetailCollection.insertMany(orderDetails);

    for (const item of items) {
      await collections.productstockCollection.updateOne(
        { ProductID: item.productId },
        { $inc: { StockQuantity: -item.quantity } }
      );
    }

    if (req.isAuthenticated) {
      await collections.database.collection('carts').deleteOne({ AccountID: req.account.AccountID });
    } else {
      req.session.cart = [];
    }

    logger.info('Order created', { orderId: orderID, customerId: req.account.CustomerID, correlationId: req.correlationId });
    res.status(201).json({ message: 'Order created successfully', order: newOrder });
  } catch (err) {
    logger.error('Error in POST /orders', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized order access attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const orders = await collections.orderCollection
      .find({ CustomerID: req.account.CustomerID })
      .sort({ OrderDate: -1 })
      .toArray();

    const orderIDs = orders.map(order => order.OrderID);
    const orderDetails = await collections.orderDetailCollection
      .find({ OrderID: { $in: orderIDs } })
      .toArray();

    const productIDs = [...new Set(orderDetails.map(detail => detail.ProductID))];
    const products = await collections.productCollection
      .find({ ProductID: { $in: productIDs } })
      .toArray();
    const productMap = products.reduce((acc, p) => {
      acc[p.ProductID] = p;
      return acc;
    }, {});

    const ordersWithDetails = orders.map(order => ({
      ...order,
      items: orderDetails
        .filter(detail => detail.OrderID === order.OrderID)
        .map(detail => ({
          productId: detail.ProductID,
          quantity: detail.Quantity,
          price: detail.Price,
          productName: productMap[detail.ProductID]?.ProductName || 'Unknown'
        })),
      _id: order._id.toHexString()
    }));

    logger.info('Fetched orders', { customerId: req.account.CustomerID, count: orders.length, correlationId: req.correlationId });
    res.json(ordersWithDetails);
  } catch (err) {
    logger.error('Error in GET /orders', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;