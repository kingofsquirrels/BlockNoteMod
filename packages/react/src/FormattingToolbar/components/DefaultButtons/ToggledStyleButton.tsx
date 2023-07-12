import { ToolbarButton } from "../../../SharedComponents/Toolbar/components/ToolbarButton";
import { formatKeyboardShortcut } from "../../../utils";
import {
  RiBold,
  RiCodeFill,
  RiItalic,
  RiStrikethrough,
  RiUnderline,
} from "react-icons/ri";
import { BlockNoteEditor, BlockSchema, ToggledStyle } from "@blocknote/core";
import { IconType } from "react-icons";
import { useState } from "react";
import { useEditorContentChange } from "../../../hooks/useEditorContentChange";

const shortcuts: Record<ToggledStyle, string> = {
  bold: "Mod+B",
  italic: "Mod+I",
  underline: "Mod+U",
  strike: "Mod+Shift+X",
  code: "",
};

const icons: Record<ToggledStyle, IconType> = {
  bold: RiBold,
  italic: RiItalic,
  underline: RiUnderline,
  strike: RiStrikethrough,
  code: RiCodeFill,
};

export const ToggledStyleButton = <BSchema extends BlockSchema>(props: {
  editor: BlockNoteEditor<BSchema>;
  toggledStyle: ToggledStyle;
}) => {
  const [active, setActive] = useState<boolean>(
    props.toggledStyle in props.editor.getActiveStyles()
  );

  useEditorContentChange(props.editor, () => {
    setActive(props.toggledStyle in props.editor.getActiveStyles());
  });

  const toggleStyle = (style: ToggledStyle) => {
    props.editor.focus();
    props.editor.toggleStyles({ [style]: true });
  };

  return (
    <ToolbarButton
      onClick={() => toggleStyle(props.toggledStyle)}
      isSelected={active}
      mainTooltip={
        props.toggledStyle.slice(0, 1).toUpperCase() +
        props.toggledStyle.slice(1)
      }
      secondaryTooltip={formatKeyboardShortcut(shortcuts[props.toggledStyle])}
      icon={icons[props.toggledStyle]}
    />
  );
};
