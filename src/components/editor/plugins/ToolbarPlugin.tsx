import { $createRangeSelection, $getRoot, $getSelection, $isParagraphNode, $isRangeSelection, $isTextNode, $setSelection, CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, createCommand, FORMAT_TEXT_COMMAND,  LexicalCommand, NodeKey, ParagraphNode, REDO_COMMAND, SELECTION_CHANGE_COMMAND, SerializedLexicalNode, TextNode, UNDO_COMMAND } from 'lexical';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection';
import { BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined, QuestionCircleOutlined, BgColorsOutlined, FunctionOutlined, UserOutlined, CopyOutlined, UploadOutlined, ClearOutlined, UndoOutlined, RedoOutlined, SaveOutlined, PlusOutlined, FontSizeOutlined, SettingOutlined, ReloadOutlined, LineOutlined, ImportOutlined } from '@ant-design/icons';
import clsx from 'clsx';
import { $getNearestBlockElementAncestorOrThrow, mergeRegister } from '@lexical/utils';
import ColorPicker from '../../color-picker';
import { cacheEventMap, INSERT_INLINE_COMMAND, nodeKeyMap } from './CommentPlugin';
import { AppContext, defaultTplMap } from '../../../store';
import { bindEvent, copy, createTime, createUID, escape, inlineEscape } from '../../../utils';
import { $createMarkNode, $isMarkNode, $unwrapMarkNode } from '@lexical/mark';
import { Dropdown, Input, InputRef, Menu, message, Modal, Select } from 'antd';
import { toStringify, transform } from '../../../core/tellraw';
import useOnce from '../../../hooks/useOnce';
import * as idbKeyval from 'idb-keyval'
import { $isHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { deserialized, parseJText } from '../../../core/tellraw/parse';

const Wrapper = styled.div`
    position: sticky;
    top: 0;
    margin-bottom: 8px;
    background: #fff;
    .text-btn {
        display: inline-block;
        font-size: 20px;
        > em {
            &::after {
                content: '|';
                display: inline-block;
                vertical-align: 1px;
                color: #ddd;
            }
        }
       .text-btn-item {
            font-size: 20px;
            padding: 4px;
            margin-right: 2px;
            border-radius: 4px;
            outline: none;
            &.disabled {
                color: #aaa;
                cursor: not-allowed;
            }
            &.active {
                background-color: #efefef;
            }
            &:hover {
                background-color: #eee;
            }
        }
    }
`

export default function ToolbarPlugin(props: {
    visible: boolean
    setVisible: React.Dispatch<React.SetStateAction<boolean>>
}) {
    const [editor] = useLexicalComposerContext()
    const [activeEditor, setActiveEditor] = useState(editor)
    const [isBold, setIsBold] = useState(false)
    const [isItalic, setIsItalic] = useState(false)
    const [isUnderline, setIsUnderline] = useState(false)
    const [isStrikethrough, setIsStrikethrough] = useState(false)
    const [isObfuscated, setIsObfuscated] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [state, dispatch] = useContext(AppContext)
    const [fontColor, setFontColor] = useState('#000')
    const [text, setText] = useState('')
    const [hasSelectedMarkOrParagraphNode, setHasSelectedMarkOrParagraphNode] = useState(false)
    const [isSelected, setIsSelected] = useState(false)
    const importTextRef = useRef<InputRef>(null)
    
    const updateToolbar = useCallback(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));
            setIsObfuscated(selection.hasFormat('subscript'));

            setFontColor($getSelectionStyleValueForProperty(selection, 'color', '#000'))
        }

    }, [activeEditor])

    useEffect(() => {
        return bindEvent('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p' && !props.visible) {
                e.preventDefault()
                props.setVisible(true)
            }
        })
    })

    useEffect(() => {
        return mergeRegister(
            activeEditor.registerCommand<boolean>(
                CAN_UNDO_COMMAND,
                (payload) => {
                    setCanUndo(payload)
                    return false
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
            activeEditor.registerCommand<boolean>(
                CAN_REDO_COMMAND,
                (payload) => {
                    setCanRedo(payload)
                    return false
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                (_payload: any, newEditor: any) => {
                  updateToolbar()
                  setActiveEditor(newEditor)
                  return false
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
            editor.registerUpdateListener(() => {
                editor.getEditorState().read(() => {
                    // ????????????
                    const text = $getRoot().getTextContent().trim()
                    setText(text)
                    // ??????????????????markNode??????
                    const selection = $getSelection()
                    if ($isRangeSelection(selection)) {
                        setIsSelected(!selection.isCollapsed())

                        const nodes = selection.getNodes()
                        const has = nodes.length === 1
                            ? nodes[0].getType() === 'mark' || $isMarkNode(nodes[0].getParent())
                            : nodes.some(node => $isMarkNode(node) || $isParagraphNode(node))
                        setHasSelectedMarkOrParagraphNode(has)
                    }
                })
            })
        )
    }, [editor, updateToolbar])

    const applyStyleText = useCallback(
        (styles: Record<string, string>) => {
            activeEditor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                    $patchStyleText(selection, styles)
                }
            });
        },
        [activeEditor],
    )

    const onFontColorSelect = useCallback(
        (value: string) => {
            applyStyleText({color: value})
        },
        [applyStyleText],
    )

    useOnce((done) => {
        done()
        // ????????????
        idbKeyval.get('__jte__').then(localState => {
            if (localState) {
                // ?????????????????????
                dispatch({
                    type: 'Load',
                    state: localState,
                })

                editor.update(() => {
                    let json
                    if (localState.currentJson) {
                        json = localState.currentJson.data
                    }
                    if (json) {
                        const editorState = editor.parseEditorState(json)
                        editor.setEditorState(editorState)
                    }
                })
            }
        })
    }, [])

    const clearFormatting = useCallback(() => {
        activeEditor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
                selection.getNodes().forEach((node) => {
                    if ($isTextNode(node)) {
                        node.setFormat(0)
                        node.setStyle('')
                        $getNearestBlockElementAncestorOrThrow(node).setFormat('')
                    }
                    const parentNode = node.getParent()
                    if ($isMarkNode(parentNode)) {
                        const id = parentNode.getIDs()[0]
                        nodeKeyMap.delete(id)
                        cacheEventMap.delete(id)
                        $unwrapMarkNode(parentNode)
                    }
                    if ($isMarkNode(node)) {
                        const id = node.getIDs()[0]
                        nodeKeyMap.delete(id)
                        cacheEventMap.delete(id)
                        $unwrapMarkNode(node)
                    }
                })
            }
        })
    }, [activeEditor])

    useEffect(() => {
        // ????????????????????????????????????
        const editorState = editor.getEditorState()

        editorState.read(() => {
            const data = editorState.toJSON()
            const nodeKeys: NodeKey[] = []
            const nodes = $getRoot().getChildren().filter(item => $isParagraphNode(item)).map(item => item.getChildren()).flat()
            nodes.forEach(node => {
                if ($isMarkNode(node)) {
                    nodeKeys.push(node.getIDs()[0])
                }
            })

            // ????????????????????????
            dispatch({
                type: 'UpdateCurrentJson',
                currentJson: (
                    {
                        id: createUID(),
                        data,
                        text,
                        nodeKeys,
                        time: createTime(),
                    }
                ),
            })
        })
    }, [state.jsonIndex, editor, text])

    const save = useCallback(() => {
        const editorState = editor.getEditorState()
        editorState.read(() => {
            const data = editorState.toJSON()
            if (state.jsonIndex !== -1) {
                const json = state.jsonList[state.jsonIndex]
                const nodeKeys: NodeKey[] = []
                const nodes = $getRoot().getChildren().filter(item => $isParagraphNode(item)).map(item => item.getChildren()).flat()
                nodes.forEach(node => {
                    if ($isMarkNode(node)) {
                        nodeKeys.push(node.getIDs()[0])
                    }
                })
                
                dispatch({
                    type: 'UpdateJson',
                    json: {
                        ...json,
                        data,
                        text,
                        nodeKeys,
                        time: createTime(),
                    },
                })
            } else {
                add(true)
            }
        })
    }, [editor, state.jsonIndex, state.jsonList, text])

    const add = useCallback((noinfo = false) => {
        const editorState = editor.getEditorState()

        editorState.read(() => {
            const data = editorState.toJSON()

            const nodeKeys: NodeKey[] = []
            const nodes = $getRoot().getChildren().filter(item => $isParagraphNode(item)).map(item => item.getChildren()).flat()
            nodes.forEach(node => {
                if ($isMarkNode(node)) {
                    nodeKeys.push(node.getIDs()[0])
                }
            })

            const promise = new Promise((resolve, reject) => {
                if (text.length) {
                    if (noinfo) {
                        resolve(true)
                    } else {
                        Modal.warning({
                            okCancel: true,
                            closable: true,
                            content: '???????????????????????????',
                            onOk() {
                                resolve(true)
                            },
                            onCancel(...args) {
                                if (args.length === 0) {
                                    resolve(false)
                                } else {
                                    reject()
                                }
                            },
                            okText: '???????????????',
                            cancelText: '????????????',
                        })
                    }
                } else {
                    resolve(false)
                }
            })
            
            promise.then((isSave) => {
                if (isSave) {
                    if (state.jsonIndex !== -1) {
                        const json = state.jsonList[state.jsonIndex]
                        dispatch({
                            type: 'UpdateJson',
                            json: {
                                ...json,
                                data,
                                nodeKeys,
                                time: createTime(),
                            },
                        })
                    } else {
                        dispatch({
                            type: 'AddJson',
                            json: {
                                id: createUID(),
                                data,
                                text,
                                nodeKeys,
                                time: createTime(),
                            }
                        })
                    }
                }
                
                dispatch({
                    type: 'UpdateJsonIndex',
                    index: -1,
                })

                editor.update(() => {
                    $getRoot().clear()
                })
            })
            
        })
        
    }, [editor, state.jsonIndex, state.jsonList, text])
    
    const activeJson = useMemo(
        () => {
            if (state.jsonIndex > -1) {
                return state.jsonList[state.jsonIndex]
            }
            return state.currentJson
        },
        [state.currentJson, state.jsonIndex, state.jsonList]
    )
    
    const eventList = useMemo(
        () => {
            if (activeJson) {
                return activeJson.nodeKeys.map(nodeKey => {
                    return cacheEventMap.get(nodeKey)!
                })
            }
            return []
        },
        [activeJson, state.trigger]
    )

    const create = (type: string) => {
        activeEditor.update(() => {
            let selection = $getSelection()
            if ($isRangeSelection(selection)) {
                let offset = 1

                if (selection.isBackward()) {
                    const focus = selection.focus;
                    const anchor = selection.anchor;
                    const newSelection = $createRangeSelection()
                    newSelection.anchor.set(focus.key, focus.offset, anchor.type)
                    newSelection.focus.set(anchor.key, anchor.offset, anchor.type)
                    $setSelection(newSelection)
                    selection = newSelection
                }

                const nodes = selection.extract()
                const result: SerializedLexicalNode[][] = []
                let tmpSerializedNode: SerializedLexicalNode[] = []

                let isFirstParagraphNode = true

                // ??????????????????
                // 1
                const firstNode = nodes[0]
                if ($isTextNode(firstNode)) {
                    const parentNode = firstNode.getParent()
                    if ($isMarkNode(parentNode)) {
                        nodes.unshift(parentNode)
                    }
                }
                // 2
                const textNodes: TextNode[] = []
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i]
                    if ($isMarkNode(node)) {
                        const childrenKeys = node.getChildrenKeys()
                        if (textNodes.length === node.getChildrenSize() && textNodes.every(textNode => childrenKeys.includes(textNode.getKey()))) {
                            nodes.unshift(...nodes.splice(i, 1))
                        }
                        textNodes.length = 0
                        break
                    }
                    textNodes.push(node as TextNode)
                }

                // for (let i = nodes.length - 1; i >= 0; i--) {
                //     const node = nodes[i]
                //     if ($isMarkNode(node)) {
                //         const childrenKeys = node.getChildrenKeys()
                //         if (textNodes.length !== childrenKeys.length) {
                //             const newMarkNode = $createMarkNode(node.getIDs())
                //             newMarkNode.append(...textNodes)
                //             nodes[i] = newMarkNode
                //         }
                //         textNodes.length = 0
                //         break
                //     }
                //     textNodes.push(node as TextNode)
                // }

                for (let i = 0; i < nodes.length; i+=offset) {
                    const node = nodes[i]

                    if ($isTextNode(node)) {
                        tmpSerializedNode.push(node.exportJSON())
                        offset = 1
                        continue
                    }
                    if ($isMarkNode(node)) {
                        const children = node.getChildren()
                        const serializedMarkNode = node.exportJSON()
                        serializedMarkNode.children = children.map(node => node.exportJSON())
                        tmpSerializedNode.push(serializedMarkNode)
                        
                        offset = children.length + 1
                        continue
                    }
                    if ($isParagraphNode(node)) {
                        offset = 1
                        if (isFirstParagraphNode) {
                            isFirstParagraphNode = false
                            continue
                        }
                        if (/tellraw|nbt|title|book/.test(type)) {
                            const node = tmpSerializedNode[tmpSerializedNode.length - 1] as any
                            if (node) {
                                if (node.type === 'text') {
                                    node.text += '\n'
                                } else if (node.type === 'mark') {
                                    node.children[node.children.length - 1].text += '\n'
                                }
                            }
                        } else {
                            result.push(tmpSerializedNode)
                            tmpSerializedNode = []
                        }
                    }
                    if (type === 'book' && $isHorizontalRuleNode(node)) {
                        result.push(tmpSerializedNode)
                        tmpSerializedNode = []
                    }
                }
                result.push(tmpSerializedNode)

                let str = ''
                if (type === 'tellraw') {
                    const text = toStringify(transform(result[0], eventList))
                    str = state.tplMap.tellraw.replace('%s', text)
                } else if (type === 'title') {
                    const text = toStringify(transform(result[0], eventList))
                    str = state.tplMap.title.replace('%s', text)
                } else if (type === 'sign') {
                    if (result.length > 4) {
                        message.warning('sign ???????????????????????????')
                        return
                    }
                    const text = result.map((item, index) => `Text${index + 1}:'${inlineEscape(toStringify(transform(item, eventList)))}'`).join(',')
                    str = state.tplMap.sign.replace('%s', text)
                } else if (type === 'book') {
                    const text = result.map(item => {
                        const props = transform(item, eventList)
                        return "'" + inlineEscape(toStringify(props)) + "'"
                    }).join(',')
                    str = state.tplMap.book.replace('%s', text)
                } else {
                    str = toStringify(transform(result[0], eventList))
                }
                copy(str)
                message.success('?????????????????????')
                                
            }
        })
    }

    return (
        <Wrapper>
            <div className="text-btn">
                <UndoOutlined title='??????(ctrl+z)' className={clsx('text-btn-item', { disabled: !canUndo })} onClick={() => {
                    if (canUndo) {
                        activeEditor.dispatchCommand(UNDO_COMMAND, undefined);
                    }
                }} />
                <RedoOutlined title='?????????(ctrl+y)' className={clsx('text-btn-item', { disabled: !canRedo })} onClick={() => {
                    if (canRedo) {
                        activeEditor.dispatchCommand(REDO_COMMAND, undefined);
                    }
                }} />
                <em></em>
                <BoldOutlined title='??????(ctrl+b)' className={clsx('text-btn-item', { active: isBold })} onClick={() => {
                    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
                }} />
                <ItalicOutlined title='??????(ctrl+i)' className={clsx('text-btn-item', { active: isItalic })} onClick={() => {
                    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
                }} />
                <UnderlineOutlined title='?????????(ctrl+u)' className={clsx('text-btn-item', { active: isUnderline })} onClick={() => {
                    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')
                }}/>
                <StrikethroughOutlined title='?????????' className={clsx('text-btn-item', { active: isStrikethrough })} onClick={() => {
                    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
                }} />
                <QuestionCircleOutlined title='??????' className={clsx('text-btn-item', { active: isObfuscated })} onClick={() => {
                    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')
                }} />
                <ColorPicker color={fontColor} onChange={onFontColorSelect}>
                    <BgColorsOutlined title='????????????' className='text-btn-item' />
                </ColorPicker>
                <ClearOutlined title='????????????' className='text-btn-item' onClick={clearFormatting}/>
                <FunctionOutlined title='????????????' className={clsx('text-btn-item', { disabled: hasSelectedMarkOrParagraphNode })} onClick={() => {
                    editor.dispatchCommand(INSERT_INLINE_COMMAND, undefined)
                }} />
                <LineOutlined title='?????????' className='text-btn-item' onClick={() => {
                    activeEditor.dispatchCommand(
                        INSERT_HORIZONTAL_RULE_COMMAND,
                        undefined,
                    );
                }} />

                <em></em>

                <PlusOutlined title='??????' className={clsx('text-btn-item', { disabled: !text })} onClick={() => {
                    if (!!text) {
                        add()
                    }
                }}/>
                <SaveOutlined disabled={!text} title='??????' className={clsx('text-btn-item', { disabled: !text })} onClick={() => {
                    if (!!text) {
                        save()
                    }
                }}/>
                <Dropdown disabled={!isSelected} overlay={<Menu onClick={(e) => {
                    create(e.key)
                }} items={[
                    { label: '???nbt', key: 'nbt', },
                    { label: 'tellraw', key: 'tellraw', },
                    { label: 'title', key: 'title', },
                    { label: 'sign', key: 'sign', },
                    { label: 'book', key: 'book', },
                ]}/>}>
                    <CopyOutlined title='??????????????????nbt' className={clsx('text-btn-item', { disabled: !isSelected })} />
                </Dropdown>
                <ColorPicker color={state.bgColor} onChange={(bgColor) => {
                    dispatch({
                        type: 'UpdateBgColor',
                        bgColor,
                    })
                }}>
                    <BgColorsOutlined title='??????????????????' className='text-btn-item' />
                </ColorPicker>
                <ReloadOutlined title='????????????' className='text-btn-item' onClick={() => {
                    Modal.warning({
                        title: '???????????????????????????????????????????????????',
                        onOk() {
                            idbKeyval.del('__jte__')
                            idbKeyval.del('__jte_cacheEventMap__')
                            idbKeyval.del('__jte_nodeKeyMap__')
                            nodeKeyMap.clear()
                            cacheEventMap.clear()
                            dispatch({
                                type: 'Reset',
                            })
                            editor.update(() => {
                                $getRoot().clear()
                            })
                        },
                        okCancel: true,
                        okText: '??????',
                        cancelText: '??????'
                    })
                }}/>
                <ImportOutlined title='????????????' className='text-btn-item' onClick={() => {
                    Modal.info({
                        title: '??????nbt??????',
                        content: (
                            <Input ref={importTextRef} placeholder='????????????nbt' autoFocus allowClear />
                        ),
                        closable: true,
                        onOk() {
                            const rawtext = importTextRef.current!.input!.value.trim()
                            if (! rawtext.length) {
                                message.warning('??????????????????????????????')
                                return true
                            }
                            parseJText(rawtext)
                                .then((tokens) => {
                                    editor.update(() => {
                                        const { nodes, eventList, nodeMap } = deserialized(tokens)
                                        const root = $getRoot()
                                        root.clear()
                                        nodeMap.forEach((value, id) => {
                                            nodeKeyMap.set(id, value)
                                        })
                                        nodes.forEach(node => {
                                            root.append(node)
                                        })
                                        eventList.forEach(item => {
                                            cacheEventMap.set(item.id, item)
                                        })
                                    })
                                }).catch(() => {
                                    message.warning('???????????????????????????')
                                    return true
                                })
                        },
                        okText: '??????'
                    })
                }} />
                <SettingOutlined title='??????(ctrl+p)' className='text-btn-item' onClick={() => {
                    props.setVisible(true)
                }} />
                {/* <FontSizeOutlined title='????????????' className='text-btn-item' onClick={() => {
                   
                }} /> */}
                {/* <Upload style={{ fontSize: 20 }} maxCount={1}
                    accept={'image/png, image/jpeg, image/jpg'}
                    action={'/'}
                    showUploadList={false}

                    beforeUpload={(file) => {
                        
                        return false
                    }} >
                    <UploadOutlined title='???????????????' className='text-btn-item' />
                </Upload> */}

            </div>
        </Wrapper>
    )
}