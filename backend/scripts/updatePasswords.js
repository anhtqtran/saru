const bcrypt = require('bcryptjs');
const { connectDB, collections, client } = require('../utils/db');
const { logger } = require('../middleware/logger');

async function updatePasswords() {
  try {
    await connectDB();
    const accountCollection = collections.accountCollection;

    // Tìm tất cả tài khoản có mật khẩu plaintext
    const accounts = await accountCollection.find({}).toArray();

    for (const account of accounts) {
      // Kiểm tra xem mật khẩu có phải plaintext không (giả sử plaintext không bắt đầu bằng $2a$)
      if (!account.CustomerPassword.startsWith('$2a$')) {
        const plaintextPassword = account.CustomerPassword;
        const hashedPassword = await bcrypt.hash(plaintextPassword, 10);

        // Cập nhật mật khẩu trong MongoDB
        await accountCollection.updateOne(
          { _id: account._id },
          { $set: { CustomerPassword: hashedPassword } }
        );
        logger.info(`Updated password for ${account.CustomerEmail}`, { correlationId: 'script' });
      }
    }
    logger.info('All passwords updated successfully!', { correlationId: 'script' });
  } catch (error) {
    logger.error('Error updating passwords', { error: error.message, correlationId: 'script' });
  } finally {
    await client.close();
    logger.info('MongoDB connection closed', { correlationId: 'script' });
  }
}

updatePasswords();