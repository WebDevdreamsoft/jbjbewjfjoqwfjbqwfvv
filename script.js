// Initialize Supabase
const SUPABASE_URL = "https://wlmnwtvbqpfalakxrfph.supabase.co";  // Get from Supabase
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsbW53dHZicXBmYWxha3hyZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTA0MzUsImV4cCI6MjA5MTY4NjQzNX0.GdjAcyyP6NuLskJGjNtbLcOrKwZmoqLAFSulRXp8lv8";     // Get from Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

// Auth Functions
async function signUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Check email for confirmation!");
}

async function signIn() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else {
        currentUser = data.user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFeed();
        loadUsers();
        listenForMessages();
    }
}

async function logout() {
    await supabase.auth.signOut();
    location.reload();
}

// Upload Post with Image
async function uploadPost() {
    const file = document.getElementById('imageFile').files[0];
    const caption = document.getElementById('caption').value;
    
    if (!file) return alert("Select an image!");
    
    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
        .from('post-images')
        .upload(fileName, file);
    
    if (error) return alert(error.message);
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);
    
    // Save to posts table
    const { error: dbError } = await supabase
        .from('posts')
        .insert({ user_id: currentUser.id, image_url: publicUrl, caption });
    
    if (dbError) alert(dbError.message);
    else {
        document.getElementById('caption').value = '';
        loadFeed();
    }
}

// Load Feed
async function loadFeed() {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*, auth.users(email)')
        .order('created_at', { ascending: false });
    
    if (error) return console.error(error);
    
    const feedDiv = document.getElementById('feed');
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
    const { data: users, error } = await supabase
        .from('auth.users')
        .select('id, email');
    
    if (error) return;
    
    const select = document.getElementById('userList');
    select.innerHTML = users
        .filter(u => u.id !== currentUser.id)
        .map(u => `<option value="${u.id}">${u.email}</option>`)
        .join('');
}

// Send DM
async function sendMessage() {
    const toUser = document.getElementById('userList').value;
    const content = document.getElementById('dmInput').value;
    
    if (!content) return;
    
    const { error } = await supabase
        .from('messages')
        .insert({ from_user: currentUser.id, to_user: toUser, content });
    
    if (error) alert(error.message);
    else {
        document.getElementById('dmInput').value = '';
        loadMessages();
    }
}

// Load conversation
async function loadMessages() {
    const toUser = document.getElementById('userList').value;
    if (!toUser) return;
    
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`from_user.eq.${currentUser.id},to_user.eq.${currentUser.id}`)
        .order('created_at', { ascending: true });
    
    if (error) return;
    
    const dmDiv = document.getElementById('dmMessages');
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
    supabase
        .channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages)
        .subscribe();
}

// Check if user is already logged in on page load
supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFeed();
        loadUsers();
        listenForMessages();
    }
});