async function updateRetentionPeriod() {
    const retentionInput = document.getElementById('retentionPeriod');
    const newRetentionPeriod = parseInt(retentionInput.value);
    
    if (isNaN(newRetentionPeriod) || newRetentionPeriod < 1) {
        alert('Please enter a valid retention period (minimum 1 hour)');
        loadChatSettings(); // Reset to current value
        return;
    }
    
    try {
        const response = await fetch('/api/chat/settings/retention', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ retentionPeriod: newRetentionPeriod })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update UI with the confirmed value from server
            retentionInput.value = data.retentionPeriod;
            alert('Retention period updated successfully');
        } else {
            throw new Error(data.error || 'Failed to update retention period');
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message);
        loadChatSettings(); // Reset to current value on error
    }
} 