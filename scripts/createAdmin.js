// scripts/createAdmin.js
// Creates an admin user for testing
// Run with: node scripts/createAdmin.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

async function createAdmin() {
    try {
        console.log('🔧 Creating admin user...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ username: 'admin' });
        if (existingAdmin) {
            console.log('⚠️  Admin user already exists!');
            console.log('   Username: admin');
            console.log('   Email: admin@mathmatix.com');
            console.log('\n💡 Use password: admin123 to log in');
            process.exit(0);
        }

        // Create admin user
        const admin = new User({
            username: 'admin',
            email: 'admin@mathmatix.com',
            passwordHash: 'admin123', // Will be hashed by pre-save hook
            role: 'admin',
            firstName: 'Admin',
            lastName: 'User',
            needsProfileCompletion: false,
            xp: 0,
            level: 1
        });

        await admin.save();

        console.log('✅ Admin user created successfully!\n');
        console.log('📋 Login credentials:');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   Email: admin@mathmatix.com');
        console.log('\n🎉 You can now log in and test admin reports!');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
