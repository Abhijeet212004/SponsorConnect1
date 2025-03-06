// DOM Elements
const roleSelect = document.getElementById('role');
const sponsorFields = document.getElementById('sponsorFields');
const sponsoredFields = document.getElementById('sponsoredFields');
const domainFilter = document.getElementById('domainFilter');
const opportunityCards = document.querySelectorAll('.opportunity-card');
const sponsorshipModal = document.getElementById('sponsorshipModal');
const closeModal = document.querySelector('.close');
const sponsorshipForm = document.getElementById('sponsorshipForm');
const authForm = document.getElementById('authForm');

// Toggle role fields in auth form
function toggleRoleFields() {
    if (!roleSelect) return;

    roleSelect.addEventListener('change', (e) => {
        const selectedRole = e.target.value;
        
        if (sponsorFields && sponsoredFields) {
            if (selectedRole === 'sponsor') {
                sponsorFields.style.display = 'block';
                sponsoredFields.style.display = 'none';
                enableFields(sponsorFields);
                disableFields(sponsoredFields);
            } else if (selectedRole === 'sponsored') {
                sponsorFields.style.display = 'none';
                sponsoredFields.style.display = 'block';
                enableFields(sponsoredFields);
                disableFields(sponsorFields);
            } else {
                sponsorFields.style.display = 'none';
                sponsoredFields.style.display = 'none';
                disableFields(sponsorFields);
                disableFields(sponsoredFields);
            }
        }
    });
}

// Enable form fields
function enableFields(container) {
    const fields = container.querySelectorAll('input, select, textarea');
    fields.forEach(field => {
        field.disabled = false;
        if (field.hasAttribute('required')) {
            field.required = true;
        }
    });
}

// Disable form fields
function disableFields(container) {
    const fields = container.querySelectorAll('input, select, textarea');
    fields.forEach(field => {
        field.disabled = true;
        field.required = false;
    });
}

// Filter opportunities by domain
function filterOpportunities() {
    if (!domainFilter || !opportunityCards) return;

    domainFilter.addEventListener('change', (e) => {
        const selectedDomain = e.target.value;
        
        opportunityCards.forEach(card => {
            const cardDomain = card.dataset.domain;
            if (selectedDomain === '' || cardDomain === selectedDomain) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Handle sponsorship modal
function handleSponsorshipModal() {
    if (!sponsorshipModal) return;

    // Open modal
    document.querySelectorAll('.initiate-sponsorship').forEach(button => {
        button.addEventListener('click', (e) => {
            const opportunityId = e.target.dataset.opportunityId;
            const amount = e.target.dataset.amount;
            
            if (sponsorshipForm) {
                sponsorshipForm.querySelector('#opportunityId').value = opportunityId;
                sponsorshipForm.querySelector('#amount').value = amount;
            }
            
            sponsorshipModal.style.display = 'block';
        });
    });

    // Close modal
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            sponsorshipModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === sponsorshipModal) {
            sponsorshipModal.style.display = 'none';
        }
    });
}

// Handle form submission
function handleFormSubmission() {
    if (!authForm) return;

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(authForm);
        const data = Object.fromEntries(formData.entries());
        
        try {
            const response = await fetch(authForm.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (response.ok) {
                window.location.href = result.redirectUrl || '/dashboard';
            } else {
                showFlashMessage(result.message || 'An error occurred', 'error');
            }
        } catch (error) {
            showFlashMessage('An error occurred while processing your request', 'error');
        }
    });
}

// Show flash message
function showFlashMessage(message, type = 'success') {
    const flashContainer = document.createElement('div');
    flashContainer.className = `flash-message ${type}`;
    flashContainer.textContent = message;
    
    document.body.insertBefore(flashContainer, document.body.firstChild);
    
    setTimeout(() => {
        flashContainer.remove();
    }, 5000);
}

// Initialize all functionality
function init() {
    toggleRoleFields();
    filterOpportunities();
    handleSponsorshipModal();
    handleFormSubmission();
}

// Run initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 