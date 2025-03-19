const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const { isAuthenticated } = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Sponsorship = require('../models/Sponsorship');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');

// Cashfree Configuration
const CASHFREE_API_KEY = process.env.CASHFREE_API_KEY?.trim();
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY?.trim();
const CASHFREE_BASE_URL = 'https://sandbox.cashfree.com/pg';

// Debug Cashfree credentials
console.log('Initializing Cashfree with:');
console.log('API Key:', CASHFREE_API_KEY ? `${CASHFREE_API_KEY.substring(0, 5)}...` : 'undefined');
console.log('Secret Key:', CASHFREE_SECRET_KEY ? '***' : 'undefined');
console.log('Base URL:', CASHFREE_BASE_URL);

// Debug Razorpay credentials
console.log('Initializing Razorpay with:');
console.log('KEY_ID:', 'rzp_test_0ZIbt0Lq015usg');
console.log('KEY_SECRET:', 'ZaIEImmBlRZ9kggXpR8i4l3K');

// Initialize Razorpay with your new credentials
const razorpay = new Razorpay({
    key_id: 'rzp_test_0ZIbt0Lq015usg',
    key_secret: 'ZaIEImmBlRZ9kggXpR8i4l3K'
});

console.log('✓ Razorpay instance created');

// Middleware to check Razorpay initialization
const checkRazorpay = (req, res, next) => {
    try {
        if (!razorpay) {
            throw new Error('Razorpay not initialized');
        }
        next();
    } catch (error) {
        console.error('Razorpay check failed:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Payment service is temporarily unavailable. Please try again later.'
        });
    }
};

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many payment attempts, please try again later.'
});

router.use(isAuthenticated);
router.use(checkRazorpay);

// Get payment configuration
router.get('/config', isAuthenticated, (req, res) => {
    res.json({
        success: true,
        message: 'Payment configuration retrieved successfully',
        paymentMethods: ['bank_transfer', 'paypal'],
        currency: 'USD',
        minAmount: 1,
        maxAmount: 1000000
    });
});

// Initiate payment
router.post('/initiate', isAuthenticated, paymentLimiter, async (req, res) => {
    try {
        const { sponsorshipId, amount, paymentMethod } = req.body;

        // Validate request
        if (!sponsorshipId || !amount || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment information'
            });
        }

        // Find sponsorship
        const sponsorship = await Sponsorship.findById(sponsorshipId)
            .populate('sponsor')
            .populate('sponsored');

        if (!sponsorship) {
            return res.status(404).json({
                success: false,
                message: 'Sponsorship not found'
            });
        }

        // Verify user is the sponsor
        if (sponsorship.sponsor._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to make this payment'
            });
        }

        // Create payment record
        const payment = {
            sponsorshipId,
            amount,
            paymentMethod,
            status: 'pending',
            payerId: req.user._id,
            payeeId: sponsorship.sponsored._id,
            createdAt: new Date()
        };

        // Store payment info in session for processing
        req.session.pendingPayment = payment;

        res.json({
            success: true,
            message: 'Payment initiated successfully',
            payment: {
                id: sponsorshipId,
                amount,
                paymentMethod,
                recipient: sponsorship.sponsored.fullName
            }
        });
    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error initiating payment'
        });
    }
});

// Real UPI verification service
const verifyUPITransaction = async (transactionId, amount, upiId) => {
    try {
        // Create a payment link for UPI
        const paymentLink = await razorpay.paymentLink.create({
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            accept_partial: false,
            description: `Payment to ${upiId}`,
            customer: {
                name: 'Customer',
                contact: '+919999999999', // Placeholder
                email: 'customer@example.com' // Placeholder
            },
            notify: {
                sms: false,
                email: false
            },
            reminder_enable: false,
            upi_link: true,
            notes: {
                transactionId: transactionId,
                upiId: upiId
            }
        });

        // Verify the payment status
        const payment = await razorpay.payments.fetch(transactionId);
        
        return {
            success: payment.status === 'captured',
            status: payment.status,
            verifiedAmount: payment.amount / 100, // Convert from paise
            timestamp: new Date(payment.created_at * 1000),
            transactionId: payment.id,
            paymentLink: paymentLink.short_url,
            message: payment.status === 'captured' ? 'Payment verified successfully' : 'Payment verification failed'
        };
    } catch (error) {
        console.error('UPI verification error:', error);
        return { success: false, error: error.message };
    }
};

// Real Bank transfer verification service
const verifyBankTransfer = async (utrNumber, amount, accountDetails) => {
    try {
        // Create a virtual account for bank transfer
        const virtualAccount = await razorpay.virtualAccounts.create({
            receiver_types: ['bank_account'],
            description: `Payment verification for UTR: ${utrNumber}`,
            amount: amount * 100, // Convert to paise
            customer: {
                name: accountDetails.accountHolderName,
                contact: '+919999999999', // Placeholder
                email: 'customer@example.com', // Placeholder
                bank_account: {
                    name: accountDetails.accountHolderName,
                    account_number: accountDetails.accountNumber,
                    ifsc: accountDetails.ifscCode
                }
            }
        });

        // Check transfer status
        const transfer = await razorpay.transfers.fetch(utrNumber);
        
        return {
            success: transfer.status === 'processed',
            status: transfer.status,
            verifiedAmount: transfer.amount / 100, // Convert from paise
            timestamp: new Date(transfer.created_at * 1000),
            utrNumber: transfer.utm,
            virtualAccount: virtualAccount.id,
            message: transfer.status === 'processed' ? 'Bank transfer verified successfully' : 'Transfer verification failed'
        };
    } catch (error) {
        console.error('Bank transfer verification error:', error);
        return { success: false, error: error.message };
    }
};

// Update the process endpoint for real-time verification
router.post('/process', isAuthenticated, paymentLimiter, async (req, res) => {
    try {
        const { notificationId, amount, transactionId, paymentMethod } = req.body;

        // Enhanced validation
        if (!notificationId || !amount || !transactionId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment information'
            });
        }

        // Find and validate notification
        const notification = await Notification.findById(notificationId)
            .populate('from')
            .populate('to')
            .populate('listingId');

        if (!notification) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification'
            });
        }

        // Get recipient details
        const recipient = notification.from;

        // Verify transaction in real-time
        let verificationResult;
        if (paymentMethod === 'upi') {
            verificationResult = await verifyUPITransaction(
                transactionId,
                amount,
                recipient.upiId
            );
        } else if (paymentMethod === 'bank') {
            verificationResult = await verifyBankTransfer(
                transactionId,
                amount,
                recipient.bankDetails
            );
        }

        if (!verificationResult.success) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed. Please check the transaction details.',
                error: verificationResult.error
            });
        }

        // Update notification with verified payment details
        notification.paymentStatus = 'completed';
        notification.paymentAmount = amount;
        notification.paymentDate = verificationResult.timestamp;
        notification.paymentMethod = paymentMethod;
        notification.transactionId = transactionId;
        notification.paymentVerificationStatus = 'verified';
        notification.verificationDetails = {
            verifiedAt: new Date(),
            verificationMethod: 'razorpay_api',
            verificationResponse: verificationResult
        };
        await notification.save();

        // Update recipient's transactions
        if (!recipient.transactions) recipient.transactions = [];
        recipient.transactions.push({
            type: 'received',
            amount: amount,
            status: 'verified',
            date: verificationResult.timestamp,
            transactionId: transactionId,
            paymentMethod: paymentMethod,
            counterparty: req.user._id,
            verificationStatus: 'verified',
            verificationDetails: verificationResult
        });
        recipient.totalAmountReceived += amount;
        await recipient.save();

        // Update sponsor's transactions
        const sponsor = notification.to;
        if (!sponsor.transactions) sponsor.transactions = [];
        sponsor.transactions.push({
            type: 'sent',
            amount: amount,
            status: 'verified',
            date: verificationResult.timestamp,
            transactionId: transactionId,
            paymentMethod: paymentMethod,
            counterparty: recipient._id,
            verificationStatus: 'verified',
            verificationDetails: verificationResult
        });
        sponsor.totalAmountSent += amount;
        await sponsor.save();

        // Update user transactions
        await User.findByIdAndUpdate(notification.from._id, {
            $push: { transactions: recipientTransaction },
            $inc: { totalAmountReceived: notification.listingId.amount }
        });

        await User.findByIdAndUpdate(notification.to._id, {
            $push: { transactions: sponsorTransaction },
            $inc: { totalAmountSent: notification.listingId.amount }
        });

        // Do not create a confirmation notification in the notification center
        // This keeps the notification center clean

        // Send real-time notification if socket.io is available
        if (global.io) {
            const notificationData = {
                notificationId,
                amount,
                transactionId,
                status: 'verified',
                paymentLink: verificationResult.paymentLink
            };
            global.io.to(recipient._id.toString()).emit('paymentVerified', notificationData);
            global.io.to(sponsor._id.toString()).emit('paymentVerified', notificationData);
        }

        res.json({
            success: true,
            message: 'Payment verified and processed successfully',
            transactionDetails: {
                id: transactionId,
                method: paymentMethod,
                timestamp: verificationResult.timestamp,
                status: 'verified',
                verificationDetails: verificationResult,
                paymentLink: verificationResult.paymentLink
            }
        });

    } catch (error) {
        console.error('Payment processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing payment'
        });
    }
});

// Get payment status
router.get('/status/:sponsorshipId', isAuthenticated, async (req, res) => {
    try {
        const sponsorship = await Sponsorship.findById(req.params.sponsorshipId);
        if (!sponsorship) {
            return res.status(404).json({
                success: false,
                message: 'Sponsorship not found'
            });
        }

        res.json({
            success: true,
            status: sponsorship.paymentStatus
        });
    } catch (error) {
        console.error('Payment status check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking payment status'
        });
    }
});

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, notificationId } = req.body;

        if (!amount || !notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Amount and notification ID are required'
            });
        }

        // Verify notification exists and user is authorized
        const notification = await Notification.findById(notificationId)
            .populate('from', 'email fullName')
            .populate('to', 'email fullName')
            .populate('listingId', 'title amount');

        if (!notification) {
            return res.status(404).json({ 
                success: false, 
                message: 'Notification not found' 
            });
        }

        // Ensure user is the sponsor
        if (notification.to.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized' 
            });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            metadata: {
                notificationId: notificationId,
                sponsorId: req.user._id.toString(),
                seekerId: notification.from._id.toString(),
                listingId: notification.listingId._id.toString()
            }
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret
        });
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error creating payment intent'
        });
    }
});

// Payment webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({
            success: false,
            message: `Webhook Error: ${err.message}`
        });
    }

    // Handle successful payment
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { notificationId, sponsorId, seekerId } = paymentIntent.metadata;

        try {
            // Update notification status
            await Notification.findByIdAndUpdate(notificationId, {
                paymentStatus: 'paid',
                paymentAmount: paymentIntent.amount / 100, // Convert from cents
                paymentDate: new Date()
            });

            // Create payment confirmation notification
            const notification = await Notification.findById(notificationId);
            const confirmationNotification = new Notification({
                type: 'payment_confirmation',
                from: sponsorId,
                to: seekerId,
                listingId: notification.listingId,
                content: `Payment of ₹${paymentIntent.amount / 100} received for listing: ${notification.listingId.title}`,
                status: 'accepted',
                paymentStatus: 'paid',
                paymentAmount: paymentIntent.amount / 100
            });

            await confirmationNotification.save();
        } catch (error) {
            console.error('Error processing payment success:', error);
            return res.status(500).json({
                success: false,
                message: 'Error processing payment confirmation'
            });
        }
    }

    res.json({ success: true, received: true });
});

// Get recipient payment details
router.get('/recipient-details/:notificationId', isAuthenticated, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.notificationId)
            .populate('from', 'fullName upiId bankDetails')
            .populate('to', 'fullName')
            .populate('listingId', 'amount');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Ensure the requester is the recipient of the notification
        if (notification.to._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to view these payment details'
            });
        }

        // Get recipient (the one receiving payment, which is 'from' in notification)
        const recipient = notification.from;
        
        // Check if recipient has payment details
        if (!recipient.upiId && (!recipient.bankDetails || !recipient.bankDetails.accountNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Recipient has not set up payment details yet'
            });
        }

        // Format bank details properly
        const bankDetails = recipient.bankDetails ? {
            accountHolder: recipient.bankDetails.accountHolderName,
            accountNumber: recipient.bankDetails.accountNumber,
            ifscCode: recipient.bankDetails.ifscCode,
            bankName: recipient.bankDetails.bankName
        } : null;

        res.json({
            success: true,
            recipientName: recipient.fullName,
            amount: notification.listingId.amount,
            upiId: recipient.upiId || null,
            qrCode: recipient.upiQrCode || null,
            bankDetails: bankDetails,
            preferredMethod: recipient.bankDetails ? 'bank' : (recipient.upiId ? 'upi' : null)
        });
    } catch (error) {
        console.error('Error fetching recipient details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recipient details'
        });
    }
});

// Create order endpoint
router.post('/create-order', isAuthenticated, async (req, res) => {
    try {
        const { notificationId, amount } = req.body;

        // Validate credentials
        if (!CASHFREE_API_KEY || !CASHFREE_SECRET_KEY) {
            console.error('Missing Cashfree credentials');
            throw new Error('Payment service configuration error');
        }

        // Validate inputs
        if (!notificationId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        // Find notification
        const notification = await Notification.findById(notificationId)
            .populate('from')
            .populate('to');

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Create unique order ID
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Prepare order data according to Cashfree's format
        const orderData = {
            order_id: orderId,
            order_amount: parseFloat(amount),
            order_currency: "INR",
            customer_details: {
                customer_id: req.user._id.toString(),
                customer_name: req.user.fullName || 'Customer',
                customer_email: req.user.email,
                customer_phone: req.user.phone || '9999999999'
            },
            order_meta: {
                return_url: `${process.env.APP_URL}/payment/success?order_id={order_id}`,
                notify_url: `${process.env.APP_URL}/payment/webhook`,
                payment_methods: null
            }
        };

        // Set up headers according to Cashfree's latest API specification
        const headers = {
            'accept': 'application/json',
            'x-api-version': '2022-09-01',
            'x-client-id': CASHFREE_API_KEY,
            'x-client-secret': CASHFREE_SECRET_KEY,
            'content-type': 'application/json'
        };

        console.log('Creating order with Cashfree:', {
            baseUrl: CASHFREE_BASE_URL,
            orderId,
            amount,
            headers: {
                'accept': headers.accept,
                'x-api-version': headers['x-api-version'],
                'x-client-id': headers['x-client-id'],
                'content-type': headers['content-type']
            }
        });

        // Make the request to Cashfree
        const response = await axios({
            method: 'post',
            url: `${CASHFREE_BASE_URL}/orders`,
            headers: headers,
            data: orderData,
            validateStatus: null
        });

        console.log('Cashfree Response:', {
            status: response.status,
            statusText: response.statusText,
            data: response.data
        });

        // Handle authentication error
        if (response.status === 401) {
            console.error('Authentication failed:', response.data);
            return res.status(401).json({
                success: false,
                message: 'Payment service authentication failed. Please try again later.'
            });
        }

        // Handle other errors
        if (response.status !== 200 || !response.data || !response.data.payment_session_id) {
            console.error('Invalid response:', response.data);
            throw new Error('Failed to create payment session');
        }

        // Store order details
        notification.paymentDetails = {
            orderId,
            amount,
            status: 'pending',
            gateway: 'cashfree',
            createdAt: new Date(),
            sessionId: response.data.payment_session_id
        };
        await notification.save();

        res.json({
            success: true,
            order: {
                orderId,
                paymentSessionId: response.data.payment_session_id,
                amount
            }
        });

    } catch (error) {
        console.error('Payment error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Error processing payment. Please try again later.',
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Payment webhook
router.post('/webhook', express.json(), async (req, res) => {
    try {
        const { order_id, order_status, transaction_id } = req.body;
        
        console.log('Webhook received:', req.body);
        
        // Find notification by order ID
        const notification = await Notification.findOne({ 'paymentDetails.orderId': order_id });
        if (!notification) {
            return res.status(404).send('Notification not found');
        }

        // Update payment status
        notification.paymentStatus = order_status === 'PAID' ? 'completed' : 'failed';
        notification.paymentDetails.status = order_status;
        notification.paymentDetails.transactionId = transaction_id;
        notification.paymentDetails.updatedAt = new Date();
        await notification.save();

        // If payment successful, create confirmation notification
        if (order_status === 'PAID') {
            const confirmationNotification = new Notification({
                type: 'payment_confirmation',
                from: notification.to,
                to: notification.from,
                listingId: notification.listingId,
                content: `Payment of ₹${notification.paymentDetails.amount} received successfully`,
                status: 'completed',
                paymentStatus: 'completed',
                paymentDetails: {
                    orderId: order_id,
                    transactionId: transaction_id,
                    amount: notification.paymentDetails.amount,
                    status: 'completed',
                    gateway: 'cashfree'
                }
            });
            await confirmationNotification.save();
        }

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

// Create Razorpay order
router.post('/create-razorpay-order', isAuthenticated, async (req, res) => {
    try {
        const { notificationId, amount } = req.body;

        console.log('Creating order with:', { notificationId, amount });

        // Validate inputs
        if (!notificationId || !amount) {
            console.error('Missing required parameters:', { notificationId, amount });
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        // Find notification and populate necessary fields
        const notification = await Notification.findById(notificationId)
            .populate('from')
            .populate('to')
            .populate('listingId');

        if (!notification) {
            console.error('Notification not found:', notificationId);
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Verify user is authorized to make this payment
        if (notification.to._id.toString() !== req.user._id.toString()) {
            console.error('Unauthorized payment attempt:', {
                userId: req.user._id,
                expectedUserId: notification.to._id
            });
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to make this payment'
            });
        }

        // Create receipt ID
        const receipt = `receipt_${Date.now()}`;

        // Create Razorpay order
        const options = {
            amount: Math.round(amount * 100), // Convert to paise and ensure it's an integer
            currency: 'INR',
            receipt: receipt,
            notes: {
                notificationId: notificationId,
                userId: req.user._id.toString()
            }
        };

        console.log('Creating Razorpay order with options:', options);

        let order;
        try {
            order = await razorpay.orders.create(options);
            console.log('Razorpay order created:', order);
        } catch (razorpayError) {
            console.error('Razorpay API error:', {
                error: razorpayError,
                message: razorpayError.message,
                stack: razorpayError.stack
            });
            return res.status(500).json({
                success: false,
                message: 'Failed to create payment order with Razorpay',
                error: razorpayError.message
            });
        }

        if (!order || !order.id) {
            console.error('Invalid order response:', order);
            return res.status(500).json({
                success: false,
                message: 'Invalid order response from Razorpay'
            });
        }

        console.log('Order created successfully:', {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });

        // Update notification with order details
        notification.paymentDetails = {
            orderId: order.id,
            receipt: receipt,
            amount: amount,
            status: 'pending',
            gateway: 'razorpay',
            createdAt: new Date()
        };

        // Save the notification
        await notification.save();

        // Send success response with order details
        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                key: 'rzp_test_0ZIbt0Lq015usg'
            }
        });
    } catch (error) {
        console.error('Payment order creation error:', {
            error: error,
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: 'Error creating payment order. Please try again later.',
            error: error.message
        });
    }
});

// Verify Razorpay payment
router.post('/verify-razorpay', isAuthenticated, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        console.log('Verifying payment:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            signature: razorpay_signature
        });

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            console.error('Missing required verification parameters');
            return res.status(400).json({
                success: false,
                message: 'Missing required verification parameters'
            });
        }

        // Find notification with this order ID
        const notification = await Notification.findOne({
            'paymentDetails.orderId': razorpay_order_id
        });

        if (!notification) {
            console.error('Notification not found for order:', razorpay_order_id);
            return res.status(400).json({
                success: false,
                message: 'Payment notification not found. Please try initiating the payment again.'
            });
        }

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', 'ZaIEImmBlRZ9kggXpR8i4l3K')
            .update(body.toString())
            .digest('hex');

        console.log('Signature verification:', {
            expected: expectedSignature,
            received: razorpay_signature
        });

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            console.error('Invalid payment signature');
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Update notification with payment details
        notification.paymentStatus = 'completed';
        notification.paymentDetails = {
            ...notification.paymentDetails,
            status: 'completed',
            paymentId: razorpay_payment_id,
            completedAt: new Date()
        };
        
        await notification.save();

        // Get payment details from Razorpay for transaction history
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        const amount = payment.amount / 100; // Convert from paise to rupees
        const timestamp = new Date();

        // Populate notification with user details
        const populatedNotification = await Notification.findById(notification._id)
            .populate('from', 'fullName email')
            .populate('to', 'fullName email')
            .populate('listingId', 'title');

        if (!populatedNotification) {
            throw new Error('Failed to retrieve notification details');
        }

        // Create transaction records for both users
        const recipientTransaction = {
            type: 'received',
            amount: amount,
            status: 'completed',
            date: timestamp,
            transactionId: razorpay_payment_id,
            paymentMethod: payment.method || 'razorpay',
            counterparty: populatedNotification.to._id,
            listingTitle: populatedNotification.listingId ? populatedNotification.listingId.title : 'Sponsorship Payment',
            counterpartyName: populatedNotification.to.fullName,
            senderName: populatedNotification.to.fullName,
            receiverName: populatedNotification.from.fullName
        };

        const sponsorTransaction = {
            type: 'sent',
            amount: amount,
            status: 'completed',
            date: timestamp,
            transactionId: razorpay_payment_id,
            paymentMethod: payment.method || 'razorpay',
            counterparty: populatedNotification.from._id,
            listingTitle: populatedNotification.listingId ? populatedNotification.listingId.title : 'Sponsorship Payment',
            counterpartyName: populatedNotification.from.fullName,
            senderName: populatedNotification.to.fullName,
            receiverName: populatedNotification.from.fullName
        };

        // Update recipient's transactions
        const updatedRecipient = await User.findByIdAndUpdate(
            populatedNotification.from._id,
            {
                $push: { transactions: recipientTransaction },
                $inc: { totalAmountReceived: amount }
            },
            { new: true }
        );

        // Update sponsor's transactions
        const updatedSponsor = await User.findByIdAndUpdate(
            populatedNotification.to._id,
            {
                $push: { transactions: sponsorTransaction },
                $inc: { totalAmountSent: amount }
            },
            { new: true }
        );

        console.log('Transaction history updated for both users:', {
            recipient: {
                id: populatedNotification.from._id,
                name: populatedNotification.from.fullName,
                transactionCount: updatedRecipient.transactions?.length || 0
            },
            sponsor: {
                id: populatedNotification.to._id,
                name: populatedNotification.to.fullName,
                transactionCount: updatedSponsor.transactions?.length || 0
            }
        });

        // Do not create a confirmation notification
        // This keeps the notification center clean

        console.log('Payment verified and saved:', {
            notificationId: notification._id,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id
        });

        res.json({
            success: true,
            message: 'Payment verified successfully'
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment: ' + error.message
        });
    }
});

module.exports = router;