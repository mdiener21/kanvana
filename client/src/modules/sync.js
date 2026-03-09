import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8080';
const pb = new PocketBase(PB_URL);

// Load existing auth from localStorage if available
const savedAuth = localStorage.getItem('pocketbase_auth');
if (savedAuth) {
  try {
    pb.authStore.loadFromCookie(savedAuth);
  } catch (err) {
    console.error('Failed to load PocketBase auth', err);
    pb.authStore.clear();
  }
}

// Update local cookie on auth changes
pb.authStore.onChange((token, model) => {
  localStorage.setItem('pocketbase_auth', pb.authStore.exportToCookie());
  window.dispatchEvent(new CustomEvent('auth-changed'));
});

export function getPb() {
  return pb;
}

export function isAuthenticated() {
  return pb.authStore.isValid;
}

export function getUser() {
  return pb.authStore.model;
}

export async function loginWithProvider(provider) {
  // PocketBase handles OAuth2 by opening a popup or redirect
  // For simplicity, we'll use the authWithOAuth2 method
  try {
    const authData = await pb.collection('users').authWithOAuth2({ provider });
    return authData;
  } catch (err) {
    console.error('OAuth2 login failed', err);
    throw err;
  }
}

export async function loginUser(email, password) {
  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    return authData;
  } catch (err) {
    console.error('Email login failed', err);
    throw err;
  }
}

export async function registerUser(email, password, name) {
  try {
    const data = {
      email,
      password,
      passwordConfirm: password,
      name: name || '',
    };
    const record = await pb.collection('users').create(data);
    // After registration, PocketBase can send verification email if configured
    // For now we'll just return the record
    return record;
  } catch (err) {
    console.error('Registration failed', err);
    throw err;
  }
}

export function logoutUser() {
  pb.authStore.clear();
}

/**
 * Sync data: Push local board to PocketBase
 * In PocketBase, we'll store each board as a record in the 'boards' collection.
 * The 'data' field will contain the full JSON of the board.
 */
export async function pushBoard(board) {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const userId = pb.authStore.model.id;

  // Check if board already exists in PB by boardId
  // We'll use the 'name' or a custom 'boardId' field.
  // Let's assume we match by the name for simplicity, or we could add a boardId field to the collection.
  // Actually, let's use the 'id' of the board from our local storage as the identifier.

  try {
    // Try to find if this board (by its local UUID) is already in PB
    // We'll store the local board ID in the 'name' field or similar,
    // but better to have it in the data or a separate field.
    // Given the collection schema I created earlier has 'name' and 'data'.

    const records = await pb.collection('boards').getList(1, 1, {
      filter: `owner = "${userId}" && name = "${board.id}"`
    });

    const dataToSave = {
      owner: userId,
      name: board.id,
      data: board
    };

    if (records.items.length > 0) {
      // Update existing
      return await pb.collection('boards').update(records.items[0].id, dataToSave);
    } else {
      // Create new
      return await pb.collection('boards').create(dataToSave);
    }
  } catch (err) {
    console.error('Failed to push board to PocketBase', err);
    throw err;
  }
}

/**
 * Sync data: Pull all boards from PocketBase
 */
export async function pullBoards() {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  try {
    const records = await pb.collection('boards').getFullList({
      sort: '-updated',
    });
    return records.map(r => r.data);
  } catch (err) {
    console.error('Failed to pull boards from PocketBase', err);
    throw err;
  }
}
