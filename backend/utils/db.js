const { MongoClient, ObjectId } = require('mongodb');
const { logger } = require('../middleware/logger');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  retryWrites: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000
});

let collections = {};

async function connectDB() {
  try {
    await client.connect();
    const database = client.db('SaruData');
    collections.accountCollection = database.collection('accounts');
    collections.productCollection = database.collection('products');
    collections.customerCollection = database.collection('customers');
    collections.cartCollection = database.collection('carts');
    collections.compareCollection = database.collection('compares');
    collections.blogCollection = database.collection('blogs');
    collections.blogCategoryCollection = database.collection('blog_categories');
    collections.faqCollection = database.collection('faqs');
    collections.membershipCollection = database.collection('memberships');
    collections.orderCollection = database.collection('orders');
    collections.orderDetailCollection = database.collection('order_details');
    collections.reviewCollection = database.collection('reviews');
    collections.productstockCollection = database.collection('productstocks');
    collections.messageCollection = database.collection('messages');
    collections.imageCollection = database.collection('images');
    collections.categoryCollection = database.collection('productcategories');
    collections.promotionCollection = database.collection('promotions');
    logger.info('MongoDB connected successfully', { correlationId: 'system' });
  } catch (error) {
    logger.error('MongoDB connection failed', { error: error.message, correlationId: 'system' });
    throw error;
  }
}

module.exports = { connectDB, collections, client, ObjectId };