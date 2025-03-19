const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb://localhost:27017/sponsorconnect');
        console.log('Connected to MongoDB');

        // Clear existing users
        await User.deleteMany({});
        console.log('Cleared existing users');

        // Create test sponsor
        const sponsor = new User({
            fullName: 'John Doe',
            email: 'sponsor@test.com',
            password: 'password123', // Will be hashed by the pre-save hook
            role: 'sponsor',
            companyName: 'Tech Innovations Inc',
            domain: ['technology', 'education'],
            budget: 50000,
            website: 'https://techinnovations.com'
        });

        // Create test sponsored user
        const sponsored = new User({
            fullName: 'Jane Smith',
            email: 'sponsored@test.com',
            password: 'password123', // Will be hashed by the pre-save hook
            role: 'sponsored',
            eventDomain: 'technology',
            amountNeeded: 10000,
            description: 'Tech conference focusing on AI and Machine Learning'
        });

        await sponsor.save();
        await sponsored.save();

        console.log('Added test users:');
        console.log('Sponsor - Email: sponsor@test.com, Password: password123');
        console.log('Sponsored - Email: sponsored@test.com, Password: password123');

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seedDatabase(); 