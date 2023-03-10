import { Editor, EditorOptions } from "@tiptap/core";
import { Node } from "prosemirror-model";
// import "./blocknote.css";
import {
  Block,
  BlockIdentifier,
  PartialBlock,
} from "./extensions/Blocks/api/blockTypes";
import { getBlockNoteExtensions, UiFactories } from "./BlockNoteExtensions";
import styles from "./editor.module.css";
import {
  defaultSlashMenuItems,
  BaseSlashMenuItem,
} from "./extensions/SlashMenu";
import { Editor as TiptapEditor } from "@tiptap/core/dist/packages/core/src/Editor";
import { nodeToBlock } from "./api/nodeConversions/nodeConversions";
import { TextCursorPosition } from "./extensions/Blocks/api/cursorPositionTypes";
import { getBlockInfoFromPos } from "./extensions/Blocks/helpers/getBlockInfoFromPos";
import { getNodeById } from "./api/util/nodeUtil";
import {
  insertBlocks,
  updateBlock,
  removeBlocks,
  replaceBlocks,
} from "./api/blockManipulation/blockManipulation";
import {
  blocksToHTML,
  HTMLToBlocks,
  blocksToMarkdown,
  markdownToBlocks,
} from "./api/formatConversions/formatConversions";

export type BlockNoteEditorOptions = {
  // TODO: Figure out if enableBlockNoteExtensions/disableHistoryExtension are needed and document them.
  enableBlockNoteExtensions: boolean;
  disableHistoryExtension: boolean;
  uiFactories: UiFactories;
  slashCommands: BaseSlashMenuItem[];
  parentElement: HTMLElement;
  editorDOMAttributes: Record<string, string>;
  onUpdate: (editor: BlockNoteEditor) => void;
  onCreate: (editor: BlockNoteEditor) => void;

  // tiptap options, undocumented
  _tiptapOptions: any;
};

const blockNoteTipTapOptions = {
  enableInputRules: true,
  enablePasteRules: true,
  enableCoreExtensions: false,
};

export class BlockNoteEditor {
  public readonly _tiptapEditor: TiptapEditor & { contentComponent: any };
  private blockCache = new WeakMap<Node, Block>();

  public get domElement() {
    return this._tiptapEditor.view.dom as HTMLDivElement;
  }

  constructor(options: Partial<BlockNoteEditorOptions> = {}) {
    const blockNoteExtensions = getBlockNoteExtensions({
      editor: this,
      uiFactories: options.uiFactories || {},
      slashCommands: options.slashCommands || defaultSlashMenuItems,
    });

    let extensions = options.disableHistoryExtension
      ? blockNoteExtensions.filter((e) => e.name !== "history")
      : blockNoteExtensions;

    const tiptapOptions: EditorOptions = {
      ...blockNoteTipTapOptions,
      ...options._tiptapOptions,
      onUpdate: () => {
        options.onUpdate?.(this);
      },
      onCreate: () => {
        options.onCreate?.(this);
      },
      extensions:
        options.enableBlockNoteExtensions === false
          ? options._tiptapOptions?.extensions
          : [...(options._tiptapOptions?.extensions || []), ...extensions],
      editorProps: {
        attributes: {
          ...(options.editorDOMAttributes || {}),
          class: [
            styles.bnEditor,
            styles.bnRoot,
            options.editorDOMAttributes?.class || "",
          ].join(" "),
        },
      },
    };

    this._tiptapEditor = new Editor(tiptapOptions) as Editor & {
      contentComponent: any;
    };
  }

  /**
   * Gets a snapshot of all top-level (non-nested) blocks in the editor.
   * @returns A snapshot of all top-level (non-nested) blocks in the editor.
   */
  public get topLevelBlocks(): Block[] {
    const blocks: Block[] = [];

    this._tiptapEditor.state.doc.firstChild!.descendants((node) => {
      blocks.push(nodeToBlock(node, this.blockCache));

      return false;
    });

    return blocks;
  }

  /**
   * Gets a snapshot of an existing block from the editor.
   * @param block The identifier of an existing block that should be retrieved.
   * @returns The block that matches the identifier, or `undefined` if no matching block was found.
   */
  public getBlock(block: BlockIdentifier): Block | undefined {
    const id = typeof block === "string" ? block : block.id;
    let newBlock: Block | undefined = undefined;

    this._tiptapEditor.state.doc.firstChild!.descendants((node) => {
      if (typeof newBlock !== "undefined") {
        return false;
      }

      if (node.type.name !== "blockContainer" || node.attrs.id !== id) {
        return true;
      }

      newBlock = nodeToBlock(node, this.blockCache);

      return false;
    });

    return newBlock;
  }

  /**
   * Traverses all blocks in the editor depth-first, and executes a callback for each.
   * @param callback The callback to execute for each block. Returning `false` stops the traversal.
   * @param reverse Whether the blocks should be traversed in reverse order.
   */
  public allBlocks(
    callback: (block: Block) => void,
    reverse: boolean = false
  ): void {
    function helper(blocks: Block[]) {
      if (reverse) {
        for (const block of blocks.reverse()) {
          helper(block.children);
          callback(block);
        }
      } else {
        for (const block of blocks) {
          callback(block);
          helper(block.children);
        }
      }
    }

    helper(this.topLevelBlocks);
  }

  /**
   * Gets a snapshot of the current text cursor position.
   * @returns A snapshot of the current text cursor position.
   */
  public getTextCursorPosition(): TextCursorPosition {
    const { node, depth, startPos, endPos } = getBlockInfoFromPos(
      this._tiptapEditor.state.doc,
      this._tiptapEditor.state.selection.from
    )!;

    // Index of the current blockContainer node relative to its parent blockGroup.
    const nodeIndex = this._tiptapEditor.state.doc
      .resolve(endPos)
      .index(depth - 1);
    // Number of the parent blockGroup's child blockContainer nodes.
    const numNodes = this._tiptapEditor.state.doc
      .resolve(endPos + 1)
      .node().childCount;

    // Gets previous blockContainer node at the same nesting level, if the current node isn't the first child.
    let prevNode: Node | undefined = undefined;
    if (nodeIndex > 0) {
      prevNode = this._tiptapEditor.state.doc.resolve(startPos - 2).node();
    }

    // Gets next blockContainer node at the same nesting level, if the current node isn't the last child.
    let nextNode: Node | undefined = undefined;
    if (nodeIndex < numNodes - 1) {
      nextNode = this._tiptapEditor.state.doc.resolve(endPos + 2).node();
    }

    return {
      block: nodeToBlock(node, this.blockCache),
      prevBlock:
        prevNode === undefined
          ? undefined
          : nodeToBlock(prevNode, this.blockCache),
      nextBlock:
        nextNode === undefined
          ? undefined
          : nodeToBlock(nextNode, this.blockCache),
    };
  }

  /**
   * Sets the text cursor position to the start or end of an existing block. Throws an error if the target block could
   * not be found.
   * @param targetBlock The identifier of an existing block that the text cursor should be moved to.
   * @param placement Whether the text cursor should be placed at the start or end of the block.
   */
  public setTextCursorPosition(
    targetBlock: BlockIdentifier,
    placement: "start" | "end" = "start"
  ) {
    const id = typeof targetBlock === "string" ? targetBlock : targetBlock.id;

    const { posBeforeNode } = getNodeById(id, this._tiptapEditor.state.doc);
    const { startPos, contentNode } = getBlockInfoFromPos(
      this._tiptapEditor.state.doc,
      posBeforeNode + 2
    )!;

    if (placement === "start") {
      this._tiptapEditor.commands.setTextSelection(startPos + 1);
    } else {
      this._tiptapEditor.commands.setTextSelection(
        startPos + contentNode.nodeSize - 1
      );
    }
  }

  /**
   * Inserts new blocks into the editor. Throws an error if the reference block could not be found.
   * @param blocksToInsert An array of blocks that should be inserted.
   * @param referenceBlock An identifier for an existing block, at which the new blocks should be inserted.
   * @param placement Whether the blocks should be inserted just before, just after, or nested inside the
   * `referenceBlock`. Inserts the blocks at the start of the existing block's children if "nested" is used.
   */
  public insertBlocks(
    blocksToInsert: PartialBlock[],
    referenceBlock: Block,
    placement: "before" | "after" | "nested" = "before"
  ): void {
    insertBlocks(blocksToInsert, referenceBlock, placement, this._tiptapEditor);
  }

  /**
   * Updates an existing block in the editor. Throws an error if the block to update could not be found.
   * @param blockToUpdate The block that should be updated.
   * @param update A block which defines how the existing block should be changed.
   */
  public updateBlock(blockToUpdate: Block, update: PartialBlock) {
    updateBlock(blockToUpdate, update, this._tiptapEditor);
  }

  /**
   * Removes existing blocks from the editor. Throws an error if any of the blocks could not be found.
   * @param blocksToRemove An array of identifiers for existing blocks that should be removed.
   */
  public removeBlocks(blocksToRemove: Block[]) {
    removeBlocks(blocksToRemove, this._tiptapEditor);
  }

  /**
   * Replaces existing blocks in the editor with new blocks. If the blocks that should be removed are not adjacent or
   * are at different nesting levels, `blocksToInsert` will be inserted at the position of the first block in
   * `blocksToRemove`. Throws an error if any of the blocks to remove could not be found.
   * @param blocksToRemove An array of blocks that should be replaced.
   * @param blocksToInsert An array of blocks to replace the old ones with.
   */
  public replaceBlocks(
    blocksToRemove: Block[],
    blocksToInsert: PartialBlock[]
  ) {
    replaceBlocks(blocksToRemove, blocksToInsert, this._tiptapEditor);
  }

  /**
   * Executes a callback function whenever the editor's content changes.
   * @param callback The callback function to execute.
   */
  public onContentChange(callback: () => void) {
    this._tiptapEditor.on("update", callback);
  }

  /**
   * Serializes blocks into an HTML string. The output is simplified in order to better conform to HTML standards. Block
   * structuring elements are removed, children of blocks which aren't list items are un-nested, and list items are
   * wrapped in `ul`/`ol` tags.
   * @param blocks An array of blocks that should be serialized into HTML.
   * @returns The blocks, serialized as an HTML string.
   */
  public async blocksToHTML(blocks: Block[]): Promise<string> {
    return blocksToHTML(blocks, this._tiptapEditor.schema);
  }

  /**
   * Parses blocks from an HTML string. Tries to create `Block` objects out of any HTML block-level elements, and
   * `InlineNode` objects from any HTML inline elements, though not all element types are recognized. If BlockNote
   * doesn't recognize an HTML element's tag, it will parse it as a paragraph or plain text.
   * @param htmlString The HTML string to parse blocks from.
   * @returns The blocks parsed from the HTML string.
   */
  public async HTMLToBlocks(htmlString: string): Promise<Block[]> {
    return HTMLToBlocks(htmlString, this._tiptapEditor.schema);
  }

  /**
   * Serializes blocks into a Markdown string. The output is simplified as Markdown does not support all
   * features of BlockNote. Block structuring elements are removed, children of blocks which aren't list items are
   * un-nested, and certain styles are removed.
   * @param blocks An array of blocks that should be serialized into Markdown.
   * @returns The blocks, serialized as a Markdown string.
   */
  public async blocksToMarkdown(blocks: Block[]): Promise<string> {
    return blocksToMarkdown(blocks, this._tiptapEditor.schema);
  }

  /**
   * Creates a list of blocks from a Markdown string. Tries to create `Block` and `InlineNode` objects based on
   * Markdown syntax, though not all symbols are recognized. If BlockNote doesn't recognize a symbol, it will parse it
   * as text.
   * @param markdownString The Markdown string to parse blocks from.
   * @returns The blocks parsed from the Markdown string.
   */
  public async markdownToBlocks(markdownString: string): Promise<Block[]> {
    return markdownToBlocks(markdownString, this._tiptapEditor.schema);
  }
}
