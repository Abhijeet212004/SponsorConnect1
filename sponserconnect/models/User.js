const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Add transaction schema
const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['sent', 'received'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    date: {
        type: Date,
        default: Date.now
    },
    counterparty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
        minlength: [2, 'Full name must be at least 2 characters long']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
    },
    role: {
        type: String,
        enum: ['sponsor', 'sponsored'],
        required: [true, 'Role is required']
    },
    // Payment fields
    upiId: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                if (!v) return true; // Allow empty
                return /^[\w\.\-]+@[\w\.\-]+$/.test(v);
            },
            message: 'Please enter a valid UPI ID'
        }
    },
    upiQrCode: {
        type: String,
        trim: true
    },
    bankDetails: {
        accountHolderName: {
            type: String,
            trim: true
        },
        accountNumber: {
            type: String,
            trim: true,
            validate: {
                validator: function(v) {
                    if (!v) return true; // Allow empty
                    return /^[0-9]{9,18}$/.test(v);
                },
                message: 'Account number must be between 9 and 18 digits'
            }
        },
        ifscCode: {
            type: String,
            trim: true,
            uppercase: true,
            validate: {
                validator: function(v) {
                    if (!v) return true; // Allow empty
                    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
                },
                message: 'Please enter a valid IFSC code'
            }
        },
        bankName: {
            type: String,
            trim: true
        }
    },
    // Sponsor specific fields
    companyName: {
        type: String,
        trim: true,
        required: function() {
            return this.role === 'sponsor';
        }
    },
    website: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                if (!v) return true; // Allow empty values
                try {
                    new URL(v);
                    return true;
                } catch (e) {
                    return false;
                }
            },
            message: 'Please enter a valid URL'
        }
    },
    budget: {
        type: Number,
        required: function() {
            return this.role === 'sponsor';
        },
        min: [1, 'Budget must be greater than 0']
    },
    domain: {
        type: [String],
        validate: {
            validator: function(v) {
                if (this.role !== 'sponsor') return true;
                return Array.isArray(v) && v.length > 0;
            },
            message: 'Please select at least one domain'
        }
    },
    // Sponsored user specific fields
    amountNeeded: {
        type: Number,
        required: function() {
            return this.role === 'sponsored';
        },
        min: [1, 'Amount needed must be greater than 0']
    },
    eventDomain: {
        type: String,
        required: function() {
            return this.role === 'sponsored';
        }
    },
    description: {
        type: String,
        required: function() {
            return this.role === 'sponsored';
        },
        trim: true,
        minlength: [10, 'Description must be at least 10 characters long']
    },
    // Common fields
    profileCompleted: {
        type: Boolean,
        default: false
    },
    photoUrl: {
        type: String,
        default: '/images/default-avatar.png'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // Add transactions array
    transactions: [transactionSchema],
    
    // Add transaction totals
    totalAmountSent: {
        type: Number,
        default: 0
    },
    totalAmountReceived: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Check if profile is completed based on role
userSchema.pre('save', function(next) {
    if (this.role === 'sponsor') {
        this.profileCompleted = !!(this.companyName && this.budget && this.domain && this.domain.length > 0);
    } else if (this.role === 'sponsored') {
        this.profileCompleted = !!(this.amountNeeded && this.eventDomain && this.description);
    }
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Get public profile method
userSchema.methods.getPublicProfile = function() {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ domain: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;