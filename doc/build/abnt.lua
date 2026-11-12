-- Filtro pandoc: adapta o markdown exportado do abntex2 para HTML/PDF.
-- Sem arquivo .bib, as citações [@chave] são mostradas como (chave).

function Cite(el)
  local keys = {}
  for _, c in ipairs(el.citations) do table.insert(keys, c.id) end
  return pandoc.Span({ pandoc.Str("(" .. table.concat(keys, "; ") .. ")") }, { class = "cite" })
end

function Div(el)
  if el.classes:includes("resumo") then
    -- Primeiro resumo = português, segundo = inglês (abstract)
    resumo_count = (resumo_count or 0) + 1
    local titulo = resumo_count == 1 and "Resumo" or "Abstract"
    table.insert(el.content, 1, pandoc.Div({ pandoc.Plain({ pandoc.Str(titulo) }) }, { class = "resumo-titulo" }))
    return el
  end
  if el.classes:includes("agradecimentos") then
    table.insert(el.content, 1, pandoc.Div({ pandoc.Plain({ pandoc.Str("Agradecimentos") }) }, { class = "resumo-titulo" }))
    return el
  end
end
