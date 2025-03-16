// Initialize Stripe with the publishable key from the server
let stripe;
let elements;

// Get Stripe publishable key from server
async function initializeStripe() {
    try {
        const response = await fetch('/payments/config');
        const { publishableKey } = await response.json();
        stripe = Stripe(publishableKey);
    } catch (error) {
        console.error('Error initializing Stripe:', error);
        showError('Failed to initialize payment system.');
    }
}

// Initialize payment elements
async function initializePayment(sponsorshipId) {
    if (!stripe) {
        await initializeStripe();
    }

    try {
        const response = await fetch('/payments/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sponsorshipId })
        });

        const { clientSecret } = await response.json();
        
        const appearance = {
            theme: 'night',
            variables: {
                colorPrimary: '#FFD700',
                colorBackground: '#1a1a1a',
                colorText: '#ffffff',
                colorDanger: '#ff4444',
                fontFamily: 'Roboto, sans-serif',
                borderRadius: '8px',
            }
        };

        elements = stripe.elements({ appearance, clientSecret });

        const paymentElement = elements.create('payment');
        paymentElement.mount('#payment-element');

        document.querySelector('#payment-form').addEventListener('submit', handleSubmit);
    } catch (error) {
        console.error('Payment initialization error:', error);
        showError('Failed to initialize payment. Please try again.');
    }
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/payments/complete`,
            },
        });

        if (error) {
            if (error.type === "card_error" || error.type === "validation_error") {
                showError(error.message);
            } else {
                showError("An unexpected error occurred.");
            }
        }
    } catch (error) {
        console.error('Payment confirmation error:', error);
        showError("An unexpected error occurred.");
    }

    setLoading(false);
}

// Show error message
function showError(message) {
    const errorDiv = document.querySelector('#error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Set loading state
function setLoading(isLoading) {
    const submitButton = document.querySelector('#submit-button');
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Processing...' : 'Pay Now';
}

// Handle payment completion
async function handlePaymentCompletion() {
    const { payment_intent: paymentIntent } = new URLSearchParams(window.location.search);
    
    if (!paymentIntent) return;

    try {
        const response = await fetch(`/payments/status/${paymentIntent}`);
        const { status } = await response.json();

        if (status === 'succeeded') {
            showSuccess();
        } else if (status === 'failed') {
            showError('Payment failed. Please try again.');
        }
    } catch (error) {
        console.error('Payment status check error:', error);
        showError('Failed to verify payment status.');
    }
}

// Show success message
function showSuccess() {
    const successDiv = document.querySelector('#success-message');
    successDiv.style.display = 'block';
    setTimeout(() => {
        window.location.href = '/dashboard';
    }, 3000);
} 