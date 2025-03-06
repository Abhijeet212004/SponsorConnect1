const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
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