/**
 * Mermaid entry point for bundling
 * This file exports mermaid as a global variable for use in webviews
 */
import mermaid from 'mermaid';

// Export mermaid to global scope
window.mermaid = mermaid;

export default mermaid;
