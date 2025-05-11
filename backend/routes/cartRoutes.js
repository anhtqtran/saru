const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || quantity <= 0) return res.status(400).json({ error: "Invalid input" });

  try {
    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const cartCollection = collections.database.collection('carts');
      let cart = await cartCollection.findOne({ AccountID });

      if (!cart) {
        cart = { AccountID, items: [{ productId, quantity }] };
        await cartCollection.insertOne(cart);
      } else {
        const existingItem = cart.items.find(item => item.productId === productId);
        if (existingItem) {
          await cartCollection.updateOne(
            { AccountID, "items.productId": productId },
            { $inc: { "items.$.quantity": quantity } }
          );
        } else {
          await cartCollection.updateOne(
            { AccountID },
            { $push: { items: { productId, quantity } } }
          );
        }
      }
      const updatedCart = await cartCollection.findOne({ AccountID });
      logger.info('Added to cart in MongoDB', { AccountID, cart: updatedCart.items, correlationId: req.correlationId });
      res.json({ message: "Added to cart", cart: updatedCart.items });
    } else {
      req.session.cart = req.session.cart || [];
      const existingItem = req.session.cart.find(item => item.productId === productId);
      if (existingItem) existingItem.quantity += quantity;
      else req.session.cart.push({ productId, quantity });
      logger.info('Added to cart in session', { sessionId: req.sessionID, cart: req.session.cart, correlationId: req.correlationId });
      res.json({ message: "Added to cart", cart: req.session.cart });
    }
  } catch (err) {
    logger.error('Error in POST /cart', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const cartCollection = collections.database.collection('carts');
      let cart = await cartCollection.findOne({ AccountID });

      if (!cart && req.session.cart?.length > 0) {
        await cartCollection.insertOne({ AccountID, items: req.session.cart });
        cart = await cartCollection.findOne({ AccountID });
        req.session.cart = [];
        logger.info('Synchronized cart from session to MongoDB', { AccountID, correlationId: req.correlationId });
      }

      logger.info('Fetched cart from MongoDB', { AccountID, cart: cart ? cart.items : [], correlationId: req.correlationId });
      res.json(cart ? cart.items : []);
    } else {
      const cart = req.session.cart || [];
      logger.info('Fetched cart from session', { sessionId: req.sessionID, cart, correlationId: req.correlationId });
      res.json(cart);
    }
  } catch (err) {
    logger.error('Error in GET /cart', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ message: 'Lỗi hệ thống khi lấy giỏ hàng.', error: err.message });
  }
});

router.delete('/:productId', authenticateToken, async (req, res) => {
  const productId = req.params.productId;

  try {
    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const cartCollection = collections.database.collection('carts');
      await cartCollection.updateOne(
        { AccountID },
        { $pull: { items: { productId } } }
      );
      const updatedCart = await cartCollection.findOne({ AccountID });
      logger.info('Removed from cart in MongoDB', { AccountID, cart: updatedCart ? updatedCart.items : [], correlationId: req.correlationId });
      res.json({ message: "Removed from cart", cart: updatedCart ? updatedCart.items : [] });
    } else {
      req.session.cart = (req.session.cart || []).filter(item => item.productId !== productId);
      logger.info('Removed from cart in session', { sessionId: req.sessionID, cart: req.session.cart, correlationId: req.correlationId });
      res.json({ message: "Removed from cart", cart: req.session.cart });
    }
  } catch (err) {
    logger.error('Error in DELETE /cart/:productId', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;