const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');

module.exports = function(passport) {
    passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    }, async (email, password, done) => {
        try {
            // Find user by email
            const user = await User.findOne({ email: email.toLowerCase() });
            
            // If user not found
            if (!user) {
                console.log('Login attempt: User not found for email:', email);
                return done(null, false, { message: 'Invalid email or password' });
            }
            
            // Check password
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                console.log('Login attempt: Invalid password for email:', email);
                return done(null, false, { message: 'Invalid email or password' });
            }
            
            // Success
            console.log('Login successful for user:', email);
            return done(null, user);
        } catch (err) {
            console.error('Login error:', err);
            return done(err);
        }
    }));
    
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });
    
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            if (!user) {
                return done(null, false);
            }
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}; 