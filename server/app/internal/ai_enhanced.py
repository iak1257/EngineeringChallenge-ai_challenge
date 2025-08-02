from __future__ import annotations

import os
import json
from typing import AsyncGenerator, Dict, Any, List

from dotenv import load_dotenv
from openai import AsyncOpenAI

import logging

from app.internal.prompt_enhanced import ENHANCED_PROMPT, FUNCTION_TOOLS
from app.internal.patent_chat_prompt import format_patent_chat_prompt
from app.internal.text_utils import html_to_plain_text

logger = logging.getLogger(__name__)

load_dotenv(override=True)  # 强制覆盖环境变量

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL") or "gpt-4o"


def get_ai_enhanced(
    model: str | None = OPENAI_MODEL,
    api_key: str | None = OPENAI_API_KEY,
) -> AIEnhanced:
    if not api_key or not model:
        raise ValueError("Both API key and model need to be set")
    return AIEnhanced(api_key, model)


class AIEnhanced:
    def __init__(self, api_key: str, model: str):
        self.model = model
        self._client = AsyncOpenAI(api_key=api_key)

    async def review_document_with_functions(self, document: str) -> AsyncGenerator[str | None, None]:
        """
        Review patent document using Function Calling for more precise suggestions.
        
        Arguments:
        document -- Patent document to review
        
        Response:
        Yields JSON with suggestions including originalText and replaceTo fields
        """
        logger.info(f"📄 开始增强版AI分析，文档长度: {len(document)}")
        logger.info(f"📄 文档内容预览: {document[:200]}...")
        
        # 使用Function Calling进行分析
        stream = await self._client.chat.completions.create(
            model=self.model,
            temperature=0.1,  # 低温度确保输出稳定性和Function Calling可靠性
            messages=[
                {"role": "system", "content": ENHANCED_PROMPT},
                {"role": "user", "content": document},
            ],
            tools=FUNCTION_TOOLS,
            tool_choice="auto",  # 让AI自动决定调用多少次函数，而不是强制单次调用
            stream=True,
        )

        # 收集function calls
        function_calls = []
        current_function_calls = {}  # 用字典跟踪多个并行的function calls
        
        logger.info("🔄 开始处理AI流式响应...")
        
        async for chunk in stream:
            delta = chunk.choices[0].delta
            
            # 记录普通文本内容（用于调试）
            if delta.content:
                logger.debug(f"📝 AI文本响应: {delta.content}")
            
            # 处理tool calls
            if delta.tool_calls:
                logger.info(f"🔧 收到tool call: {delta.tool_calls}")
                for tool_call in delta.tool_calls:
                    call_index = tool_call.index
                    
                    if tool_call.function.name:
                        # 新的function call开始
                        if call_index in current_function_calls:
                            # 如果这个index已经有function call，先保存之前的
                            function_calls.append(current_function_calls[call_index])
                        
                        current_function_calls[call_index] = {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments or ""
                        }
                        logger.info(f"🆕 新的function call {call_index}: {tool_call.function.name}")
                        
                    elif call_index in current_function_calls:
                        # 继续累积这个index的arguments
                        current_function_calls[call_index]["arguments"] += tool_call.function.arguments or ""
        
        # 添加所有剩余的function calls
        for call_index, func_call in current_function_calls.items():
            function_calls.append(func_call)
        
        logger.info(f"📊 收集到 {len(function_calls)} 个function calls")
        for i, call in enumerate(function_calls):
            logger.info(f"🔧 Function call {i+1}: {call['name']}")
            logger.debug(f"🔧 Arguments: {call['arguments'][:200]}...")
        
        # 处理并生成响应
        issues = []
        diagram_insertions = []
        
        for func_call in function_calls:
            if func_call["name"] == "create_suggestion":
                try:
                    args = json.loads(func_call["arguments"])
                    logger.info(f"✅ 解析function arguments成功: {args}")
                    
                    # 处理新格式：一个文本段可能有多个issues
                    text_issues = args.get("issues", [])
                    
                    # 如果是旧格式（向后兼容）
                    if not text_issues and args.get("type"):
                        text_issues = [{
                            "type": args.get("type", ""),
                            "severity": args.get("severity", "medium"),
                            "description": args.get("description", "")
                        }]
                    
                    # 创建一个单一的建议条目，包含所有issues
                    if text_issues:
                        # 合并所有issues的类型和描述
                        types = [issue.get("type", "") for issue in text_issues]
                        descriptions = [issue.get("description", "") for issue in text_issues]
                        severities = [issue.get("severity", "medium") for issue in text_issues]
                        
                        # 选择最高严重度
                        severity_order = {"high": 3, "medium": 2, "low": 1}
                        max_severity = max(severities, key=lambda x: severity_order.get(x, 2))
                        
                        # 创建单一建议
                        issue = {
                            "type": " & ".join(types),  # 合并所有issue类型
                            "severity": max_severity,
                            "paragraph": args.get("paragraph", 1),
                            "description": " | ".join(descriptions),  # 合并所有描述
                            "text": args.get("originalText", ""),  # 映射字段
                            "suggestion": args.get("replaceTo", ""),  # 映射字段
                            "originalText": args.get("originalText", ""),
                            "replaceTo": args.get("replaceTo", ""),
                            "issues": text_issues  # 保留详细的issues数组供UI使用
                        }
                        issues.append(issue)
                        logger.info(f"📝 添加建议: {issue['type']} - 包含 {len(text_issues)} 个问题")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ JSON解析失败: {e}")
                    logger.error(f"❌ 原始arguments: {func_call['arguments']}")
                    continue
                    
            elif func_call["name"] == "insert_diagram":
                try:
                    args = json.loads(func_call["arguments"])
                    logger.info(f"📊 解析图表插入请求: {args}")
                    
                    diagram_insertion = {
                        "insert_after_text": args.get("insert_after_text", ""),
                        "mermaid_syntax": args.get("mermaid_syntax", ""),
                        "diagram_type": args.get("diagram_type", "flowchart"),
                        "title": args.get("title", "")
                    }
                    diagram_insertions.append(diagram_insertion)
                    logger.info(f"📊 添加图表插入: 在'{args.get('insert_after_text', '')[:50]}...'之后")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ 图表插入JSON解析失败: {e}")
                    logger.error(f"❌ 原始arguments: {func_call['arguments']}")
                    continue
        
        logger.info(f"✨ 最终生成 {len(issues)} 个建议 和 {len(diagram_insertions)} 个图表插入")
        
        # 生成JSON响应
        response = {
            "issues": issues,
            "diagram_insertions": diagram_insertions
        }
        response_json = json.dumps(response, ensure_ascii=False)
        logger.info(f"📤 返回响应: {response_json[:200]}...")
        yield response_json

    async def chat_with_user(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str | None, None]:
        """
        聊天功能，支持Function Calling
        
        Arguments:
        messages -- 聊天历史消息列表
        
        Response:
        流式返回AI响应
        """
        stream = await self._client.chat.completions.create(
            model=self.model,
            temperature=0.2,  # 聊天时稍高一点的温度，保持一定创造性
            messages=messages,
            tools=FUNCTION_TOOLS,
            tool_choice="auto",
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            
            # 处理普通文本响应
            if delta.content:
                yield delta.content
            
            # 处理工具调用
            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    if tool_call.function.name == "create_diagram":
                        # 处理图表生成
                        try:
                            args = json.loads(tool_call.function.arguments)
                            diagram_response = {
                                "type": "diagram",
                                "data": args
                            }
                            yield f"\n```mermaid\n{args.get('mermaid_syntax', '')}\n```\n"
                        except json.JSONDecodeError:
                            continue

    async def chat_with_document_context(self, messages: List[Dict[str, str]], document_content: str = "") -> AsyncGenerator[str | None, None]:
        """
        带文档上下文的聊天功能，支持图表插入
        
        Arguments:
        messages -- 聊天历史消息列表
        document_content -- 当前文档内容（HTML格式）
        
        Response:
        流式返回AI响应，包含可能的图表插入指令
        """
        # 转换HTML文档内容为纯文本
        plain_text_content = ""
        if document_content.strip():
            plain_text_content = html_to_plain_text(document_content)
            logger.info(f"📄 文档内容长度: {len(plain_text_content)}")

        # 构建增强的消息列表，包含系统提示和文档上下文
        enhanced_messages = []
        
        if messages and len(messages) > 0:
            last_user_message = messages[-1].get("content", "")
            
            # 创建专利助手系统提示
            system_prompt = format_patent_chat_prompt(plain_text_content, last_user_message)
            enhanced_messages.append({
                "role": "system",
                "content": system_prompt
            })
            
            # 添加用户消息历史（排除最后一条，因为已经在系统提示中处理）
            enhanced_messages.extend(messages[:-1])
            
            # 添加当前用户消息
            enhanced_messages.append({
                "role": "user", 
                "content": last_user_message
            })
        else:
            enhanced_messages = messages

        logger.info(f"🤖 开始带文档上下文的AI聊天，消息数: {len(enhanced_messages)}")

        # 使用Function Calling进行聊天
        stream = await self._client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            messages=enhanced_messages,
            tools=FUNCTION_TOOLS,
            tool_choice="auto",
            stream=True,
        )
        
        # 处理流式响应和函数调用
        function_calls = []
        current_function_calls = {}
        
        async for chunk in stream:
            delta = chunk.choices[0].delta
            
            # 处理普通文本响应
            if delta.content:
                yield delta.content
            
            # 处理函数调用
            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    call_index = tool_call.index
                    
                    if tool_call.function.name:
                        # 新的function call开始
                        if call_index in current_function_calls:
                            function_calls.append(current_function_calls[call_index])
                        
                        current_function_calls[call_index] = {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments or ""
                        }
                        
                    elif call_index in current_function_calls:
                        # 继续累积arguments
                        current_function_calls[call_index]["arguments"] += tool_call.function.arguments or ""
        
        # 处理所有收集到的函数调用
        for call_index, func_call in current_function_calls.items():
            function_calls.append(func_call)
        
        # 处理函数调用结果
        for func_call in function_calls:
            if func_call["name"] == "create_diagram":
                # 聊天中显示图表
                try:
                    args = json.loads(func_call["arguments"])
                    yield f"\n```mermaid\n{args.get('mermaid_syntax', '')}\n```\n"
                except json.JSONDecodeError:
                    continue
                    
            elif func_call["name"] == "insert_diagram":
                # 插入图表到文档中
                try:
                    args = json.loads(func_call["arguments"])
                    logger.info(f"📊 AI请求插入图表: {args}")
                    
                    # 发送特殊格式的图表插入指令
                    insert_command = json.dumps({
                        "insert_after_text": args.get("insert_after_text", ""),
                        "mermaid_syntax": args.get("mermaid_syntax", ""),
                        "diagram_type": args.get("diagram_type", "flowchart"),
                        "title": args.get("title", "")
                    })
                    yield f"DIAGRAM_INSERT:{insert_command}"
                    
                except json.JSONDecodeError as e:
                    logger.error(f"❌ 图表插入参数解析失败: {e}")
                    continue