'use strict';
start().catch(e => { root().innerHTML = `<div class="formside"><div class="formbox"><h1>Something went wrong</h1><p class="muted">${esc(e.message)}</p></div></div>`; });
