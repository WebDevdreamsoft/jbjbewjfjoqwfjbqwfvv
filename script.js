// Initialize Supabase
const SUPABASE_URL = "https://wlmnwtvbqpfalakxrfph.supabase.co";  // Get from Supabase
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsbW53dHZicXBmYWxha3hyZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTA0MzUsImV4cCI6MjA5MTY4NjQzNX0.GdjAcyyP6NuLskJGjNtbLcOrKwZmoqLAFSulRXp8lv8";     // Get from Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


let currentUser = null;

// Auth Functions
async function signUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    console.log("Signing up:", email);
    
    const { data, error } = await supabaseClient.auth.signUp({ 
        email: email, 
        password: password 
    });
    
    if (error) {
        alert("Error: " + error.message);
        console.error(error);
    } else {
        alert("Success! Check your email for confirmation link.");
        console.log("Signup success:", data);
    }
}

async function signIn() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    console.log("Logging in:", email);
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ 
        email: email, 
        password: password 
    });
    
    if (error) {
        alert("Error: " + error.message);
        console.error(error);
    } else {
        currentUser = data.user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFeed();
        loadUsers();
        listenForMessages();
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

// Upload Post with Image
async function uploadPost() {
    const file = document.getElementById('imageFile').files[0];
    const caption = document.getElementById('caption').value;
    
    if (!file) {
        alert("Select an image first!");
        return;
    }
    
    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabaseClient.storage
        .from('post-images')
        .upload(fileName, file);
    
    if (error) {
        alert("Upload error: " + error.message);
        return;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
        .from('post-images')
        .getPublicUrl(fileName);
    
    // Save to posts table
    const { error: dbError } = await supabaseClient
        .from('posts')
        .insert({ user_id: currentUser.id, image_url: publicUrl, caption });
    
    if (dbError) {
        alert("Database error: " + dbError.message);
    } else {
        document.getElementById('caption').value = '';
        loadFeed();
    }
}

// Load Feed
async function loadFeed() {
    const { data: posts, error } = await supabaseClient
        .from('posts')
        .select('*, auth.users(email)')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error(error);
        return;
    }
    
    const feedDiv = document.getElementById('feed');
    if (!posts || posts.length === 0) {
        feedDiv.innerHTML = "<p>No posts yet. Upload your first photo!</p>";
        return;
    }
    
    feedDiv.innerHTML = posts.map(post => `
        <div class="post">
            <img src="${post.image_url}" alt="Post">
            <div class="post-caption">
                <strong>${post.users?.email || 'User'}</strong><br>
                ${post.caption || ''}
            </div>
        </div>
    `).join('');
}

// Load Users for DM dropdown
async function loadUsers() {
    const { data: users, error } = await supabaseClient
        .from('users')
        .select('id, email');
    
    if (error) {
        // Try alternative query if users table doesn't exist
        console.error("Could not load users:", error);
        return;
    }
    
    const select = document.getElementById('userList');
    if (users && users.length > 0) {
        select.innerHTML = users
            .filter(u => u.id !== currentUser?.id)
            .map(u => `<option value="${u.id}">${u.email}</option>`)
            .join('');
    } else {
        select.innerHTML = '<option>No other users found</option>';
    }
}

// Send DM
async function sendMessage() {
    const toUser = document.getElementById('userList').value;
    const content = document.getElementById('dmInput').value;
    
    if (!content) return;
    if (!toUser || toUser === 'No other users found') {
        alert("Select a user to message first");
        return;
    }
    
    const { error } = await supabaseClient
        .from('messages')
        .insert({ from_user: currentUser.id, to_user: toUser, content });
    
    if (error) {
        alert("Message error: " + error.message);
    } else {
        document.getElementById('dmInput').value = '';
        loadMessages();
    }
}

// Load conversation
async function loadMessages() {
    const toUser = document.getElementById('userList').value;
    if (!toUser || toUser === 'No other users found') return;
    
    const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .or(`from_user.eq.${currentUser.id},to_user.eq.${currentUser.id}`)
        .order('created_at', { ascending: true });
    
    if (error) {
        console.error(error);
        return;
    }
    
    const dmDiv = document.getElementById('dmMessages');
    if (!data || data.length === 0) {
        dmDiv.innerHTML = "<p>No messages yet. Send one!</p>";
        return;
    }
    
    dmDiv.innerHTML = data.map(msg => `
        <div style="text-align: ${msg.from_user === currentUser.id ? 'right' : 'left'}; 
                    background: ${msg.from_user === currentUser.id ? '#dcf8c5' : 'white'};
                    padding: 5px; margin: 5px; border-radius: 8px;">
            ${msg.content}
        </div>
    `).join('');
}

// Realtime for new messages
function listenForMessages() {
    supabaseClient
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages)
        .subscribe();
}

// Check if user is already logged in on page load
async function checkUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFeed();
        loadUsers();
        listenForMessages();
    }
}

// Run this when page loads
checkUser();