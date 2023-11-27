import { Node } from "@tiptap/core";
import { PropSchema } from "../blocks/types";
import {
  InlineContentConfig,
  InlineContentImplementation,
  InlineContentSchemaFromSpecs,
  InlineContentSpec,
  InlineContentSpecs,
} from "./types";

// This helper function helps to instantiate a InlineContentSpec with a
// config and implementation that conform to the type of Config
export function createInternalInlineContentSpec<T extends InlineContentConfig>(
  config: T,
  implementation: InlineContentImplementation<T>
) {
  return {
    config,
    implementation,
  } satisfies InlineContentSpec<T>;
}

export function createInlineContentSpecFromTipTapNode<
  T extends Node,
  P extends PropSchema
>(node: T, propSchema: P) {
  return createInternalInlineContentSpec(
    {
      type: node.name as T["name"],
      propSchema,
      content: node.config.content === "inline*" ? "styled" : "none",
    },
    {
      node,
    }
  );
}

export function getInlineContentSchemaFromSpecs<T extends InlineContentSpecs>(
  specs: T
) {
  return Object.fromEntries(
    Object.entries(specs).map(([key, value]) => [key, value.config])
  ) as InlineContentSchemaFromSpecs<T>;
}
