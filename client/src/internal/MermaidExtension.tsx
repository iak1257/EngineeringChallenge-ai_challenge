import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

// Mermaid diagram component for TipTap
function MermaidNodeView({ node }: { node: any; updateAttributes?: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const { syntax, title } = node.attrs;
  
  useEffect(() => {
    if (ref.current && syntax) {
      // Initialize mermaid with settings
      mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'default',
        securityLevel: 'loose'
      });
      
      // Clear previous content
      ref.current.innerHTML = '';
      
      // Render the diagram
      mermaid.render('mermaid-' + Date.now(), syntax)
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        })
        .catch((error) => {
          console.error('Mermaid rendering error:', error);
          if (ref.current) {
            ref.current.innerHTML = `<div class="error">Failed to render diagram: ${error.message}</div>`;
          }
        });
    }
  }, [syntax]);

  return (
    <div className="mermaid-node-wrapper" contentEditable={false}>
      {title && (
        <div className="mermaid-title text-sm font-semibold text-gray-700 mb-2 text-center">
          {title}
        </div>
      )}
      <div 
        ref={ref} 
        className="mermaid-diagram border rounded-lg p-4 bg-gray-50 my-4"
      />
      <div className="mermaid-actions text-center mt-2">
        <button
          className="text-xs text-gray-500 hover:text-gray-700 mr-2"
          onClick={() => {
            // TODO: Add edit functionality
            console.log('Edit diagram:', syntax);
          }}
        >
          Edit
        </button>
        <button
          className="text-xs text-red-500 hover:text-red-700"
          onClick={() => {
            // TODO: Add delete functionality
            console.log('Delete diagram');
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export interface MermaidOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidDiagram: {
      /**
       * Insert a Mermaid diagram
       */
      insertMermaidDiagram: (options: { syntax: string; title?: string }) => ReturnType;
    };
  }
}

export const MermaidNode = Node.create<MermaidOptions>({
  name: 'mermaidDiagram',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      syntax: {
        default: '',
        parseHTML: element => element.getAttribute('data-syntax'),
        renderHTML: attributes => {
          if (!attributes.syntax) {
            return {};
          }
          return {
            'data-syntax': attributes.syntax,
          };
        },
      },
      title: {
        default: '',
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {};
          }
          return {
            'data-title': attributes.title,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid-diagram"]',
        getAttrs: element => {
          const syntax = (element as HTMLElement).getAttribute('data-syntax');
          const title = (element as HTMLElement).getAttribute('data-title');
          return { syntax, title };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { 'data-type': 'mermaid-diagram' },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaidDiagram:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

// Helper function to insert diagram after specific text
export function insertDiagramAfterText(
  editor: any, 
  searchText: string, 
  mermaidSyntax: string, 
  title?: string
): boolean {
  const { state } = editor;
  let insertPosition: number | null = null;
  
  // Find the text in the document
  state.doc.descendants((node: any, pos: number) => {
    if (insertPosition !== null) return false; // Already found
    
    if (node.isText && node.text) {
      const normalizedText = node.text.toLowerCase();
      const normalizedSearch = searchText.toLowerCase().trim();
      const index = normalizedText.indexOf(normalizedSearch);
      
      if (index !== -1) {
        // Position after the found text
        insertPosition = pos + index + searchText.length;
        return false; // Stop searching
      }
    }
  });
  
  if (insertPosition !== null) {
    // Insert a new paragraph and then the diagram
    editor
      .chain()
      .focus()
      .setTextSelection(insertPosition)
      .insertContent('\n\n') // Add some spacing
      .insertMermaidDiagram({ syntax: mermaidSyntax, title })
      .insertContent('\n') // Add spacing after diagram
      .run();
    return true;
  }
  
  return false;
}