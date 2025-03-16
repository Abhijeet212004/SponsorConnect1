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
console.log('KEY_ID:', process.env.RAZORPAY_KEY_ID);
console.log('KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '***' : 'undefined');

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

        // Create confirmation notification
        const confirmationNotification = new Notification({
            type: 'message',
            user: notification.from._id,
            from: notification.to._id,
            to: notification.from._id,
            listingId: notification.listingId._id,
            content: `Payment of ₹${amount} completed via ${paymentMethod.toUpperCase()}. Transaction ID: ${transactionId}`,
            status: 'accepted',
            paymentStatus: 'completed',
            paymentAmount: amount,
            paymentMethod: paymentMethod,
            transactionId: transactionId,
            paymentDate: verificationResult.timestamp,
            paymentDetails: {
                orderId: transactionId,
                amount: amount,
                status: 'completed',
                completedAt: verificationResult.timestamp,
                paymentId: transactionId,
                method: paymentMethod
            }
        });
        await confirmationNotification.save();

        // Send real-time notification
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
                content: `Payment of $${paymentIntent.amount / 100} received for listing: ${notification.listingId.title}`,
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
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
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

        console.log('Creating Razorpay order:', options);

        const order = await razorpay.orders.create(options);

        if (!order || !order.id) {
            throw new Error('Failed to create Razorpay order');
        }

        console.log('Razorpay order created successfully:', {
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
        await notification.save();

        // Return order details
        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount / 100,
                currency: order.currency,
                key: 'rzp_test_0ZIbt0Lq015usg'
            }
        });

    } catch (error) {
        console.error('Razorpay order creation error:', {
            message: error.message,
            stack: error.stack,
            details: error.error || error
        });
        res.status(500).json({
            success: false,
            message: 'Error creating payment order. Please try again later.'
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
            console.error('Signature verification failed');
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // First try to find notification by order ID in paymentDetails
        let notification = await Notification.findOne({
            $or: [
                { 'paymentDetails.orderId': razorpay_order_id },
                { 'paymentDetails.receipt': { $exists: true } }
            ]
        }).populate('from').populate('to').populate('listingId');

        console.log('Initial notification search result:', notification ? notification._id : 'Not found');

        // If not found, try to find the most recent pending notification for the user
        if (!notification) {
            notification = await Notification.findOne({
                paymentStatus: 'pending',
                type: { $in: ['connection_accepted', 'payment_request'] }
            }).sort({ createdAt: -1 }).populate('from').populate('to').populate('listingId');

            console.log('Fallback notification search result:', notification ? notification._id : 'Not found');
        }

        if (!notification) {
            console.error('Order not found:', razorpay_order_id);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Get payment details from Razorpay
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        const amount = payment.amount / 100; // Convert from paise to rupees
        const timestamp = new Date();

        console.log('Payment details:', {
            amount,
            method: payment.method,
            status: payment.status
        });

        // Update notification status
        notification.paymentStatus = 'completed';
        notification.paymentAmount = amount;
        notification.paymentDate = timestamp;
        notification.paymentMethod = payment.method;
        notification.transactionId = razorpay_payment_id;
        notification.paymentDetails = {
            orderId: razorpay_order_id,
            receipt: notification.paymentDetails?.receipt,
            amount: amount,
            status: 'completed',
            completedAt: timestamp,
            paymentId: razorpay_payment_id,
            method: payment.method
        };
        await notification.save();

        // Create transaction records for both users
        const recipientTransaction = {
            type: 'received',
            amount: amount,
            status: 'completed',
            date: timestamp,
            transactionId: razorpay_payment_id,
            paymentMethod: payment.method,
            counterparty: notification.to._id,
            listingTitle: notification.listingId ? notification.listingId.title : 'Sponsorship Payment',
            counterpartyName: notification.to.fullName
        };

        const sponsorTransaction = {
            type: 'sent',
            amount: amount,
            status: 'completed',
            date: timestamp,
            transactionId: razorpay_payment_id,
            paymentMethod: payment.method,
            counterparty: notification.from._id,
            listingTitle: notification.listingId ? notification.listingId.title : 'Sponsorship Payment',
            counterpartyName: notification.from.fullName
        };

        console.log('Updating user transactions');

        // Initialize transactions array if it doesn't exist and update both users atomically
        await Promise.all([
            User.findByIdAndUpdate(
                notification.from._id,
                {
                    $push: { transactions: recipientTransaction },
                    $inc: { totalAmountReceived: amount },
                    $setOnInsert: { transactions: [] }
                },
                { upsert: true, new: true }
            ),
            User.findByIdAndUpdate(
                notification.to._id,
                {
                    $push: { transactions: sponsorTransaction },
                    $inc: { totalAmountSent: amount },
                    $setOnInsert: { transactions: [] }
                },
                { upsert: true, new: true }
            )
        ]);

        // Create confirmation notifications for both users
        const confirmationNotifications = [
            new Notification({
                type: 'payment_confirmation',
                from: notification.to._id,
                to: notification.from._id,
                listingId: notification.listingId._id,
                content: `Payment of ₹${amount} received from ${notification.to.fullName}. Transaction ID: ${razorpay_payment_id}`,
                status: 'completed',
                paymentStatus: 'completed',
                paymentAmount: amount,
                paymentMethod: payment.method,
                transactionId: razorpay_payment_id,
                paymentDate: timestamp,
                paymentDetails: {
                    orderId: razorpay_order_id,
                    amount: amount,
                    status: 'completed',
                    completedAt: timestamp,
                    paymentId: razorpay_payment_id,
                    method: payment.method
                }
            }),
            new Notification({
                type: 'payment_confirmation',
                from: notification.from._id,
                to: notification.to._id,
                listingId: notification.listingId._id,
                content: `Your payment of ₹${amount} to ${notification.from.fullName} was successful. Transaction ID: ${razorpay_payment_id}`,
                status: 'completed',
                paymentStatus: 'completed',
                paymentAmount: amount,
                paymentMethod: payment.method,
                transactionId: razorpay_payment_id,
                paymentDate: timestamp,
                paymentDetails: {
                    orderId: razorpay_order_id,
                    amount: amount,
                    status: 'completed',
                    completedAt: timestamp,
                    paymentId: razorpay_payment_id,
                    method: payment.method
                }
            })
        ];

        await Notification.insertMany(confirmationNotifications);

        // Send real-time notifications if socket.io is available
        if (global.io) {
            const notificationData = {
                type: 'payment_confirmation',
                amount,
                transactionId: razorpay_payment_id,
                paymentMethod: payment.method,
                timestamp
            };
            global.io.to(notification.from._id.toString()).emit('paymentConfirmed', notificationData);
            global.io.to(notification.to._id.toString()).emit('paymentConfirmed', notificationData);
        }

        res.json({
            success: true,
            message: 'Payment verified and recorded successfully',
            transaction: {
                id: razorpay_payment_id,
                amount,
                method: payment.method,
                timestamp,
                status: 'completed'
            }
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