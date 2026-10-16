/**
 * 双语字典配置 (i18n Dictionary)
 */
const i18n = {
    zh: {
        navTitle: "🏥 智慧医疗诊所管理系统",
        badgeText: "模拟数据库: 已激活",
        formTitleAdd: "新建挂号记录",
        formTitleEdit: "编辑挂号记录",
        labelName: "患者姓名",
        phName: "例如：张三",
        labelGenderAge: "性别与年龄",
        optMale: "男",
        optFemale: "女",
        phAge: "年龄",
        labelDepartment: "就诊科室",
        deptGeneral: "全科医学科",
        deptInternal: "内科",
        deptSurgery: "外科",
        deptPediatrics: "儿科",
        deptOphthalmology: "眼科",
        labelSymptoms: "病情描述",
        phSymptoms: "简述患者症状...",
        btnSave: "保存到数据库",
        btnUpdate: "更新记录",
        btnReset: "重置",
        tableTitle: "患者挂号数据库列表",
        phSearch: "搜索姓名或科室...",
        btnClearDb: "清空模拟数据库",
        thId: "ID",
        thName: "患者姓名",
        thGenderAge: "性别/年龄",
        thDepartment: "就诊科室",
        thSymptoms: "病情描述",
        thTime: "挂号时间",
        thAction: "操作",
        btnEdit: "编辑",
        btnDelete: "删除",
        emptyText: "暂无记录，请在左侧添加新挂号信息。",
        noSymptoms: "无",
        confirmDelete: "确定要从模拟数据库中删除记录吗？",
        confirmClear: "警告：这将删除本地模拟数据库中的所有记录，是否继续？",
        unitAge: "岁"
    },
    en: {
        navTitle: "🏥 Smart Medical Clinic System",
        badgeText: "Mock DB: Active",
        formTitleAdd: "New Registration",
        formTitleEdit: "Edit Registration",
        labelName: "Patient Name",
        phName: "e.g. John Doe",
        labelGenderAge: "Gender & Age",
        optMale: "Male",
        optFemale: "Female",
        phAge: "Age",
        labelDepartment: "Department",
        deptGeneral: "General Practice",
        deptInternal: "Internal Medicine",
        deptSurgery: "Surgery",
        deptPediatrics: "Pediatrics",
        deptOphthalmology: "Ophthalmology",
        labelSymptoms: "Symptoms / Notes",
        phSymptoms: "Describe symptoms brief...",
        btnSave: "Save to Mock DB",
        btnUpdate: "Update Record",
        btnReset: "Reset",
        tableTitle: "Registration Database",
        phSearch: "Search name or dept...",
        btnClearDb: "Clear Mock DB",
        thId: "ID",
        thName: "Name",
        thGenderAge: "Gender/Age",
        thDepartment: "Department",
        thSymptoms: "Symptoms",
        thTime: "Time Created",
        thAction: "Action",
        btnEdit: "Edit",
        btnDelete: "Delete",
        emptyText: "No records found. Add new registration on the left.",
        noSymptoms: "None",
        confirmDelete: "Are you sure you want to delete this record from Mock DB?",
        confirmClear: "WARNING: This will erase all records from local Mock DB. Continue?",
        unitAge: " yrs"
    }
};

// 当前语言设置，默认中文
let currentLang = localStorage.getItem('app_lang') || 'zh';

/**
 * 切换语言函数
 */
function switchLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('app_lang', lang);

    // 1. 更新按钮高亮状态
    document.getElementById('btnZh').classList.toggle('active', lang === 'zh');
    document.getElementById('btnEn').classList.toggle('active', lang === 'en');

    // 2. 批量翻译包含 data-i18n 的文本元素
    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const key = elem.getAttribute('data-i18n');
        if (i18n[lang][key]) {
            elem.innerText = i18n[lang][key];
        }
    });

    // 3. 批量翻译输入框的 placeholder 占位符
    document.querySelectorAll('[data-i18n-ph]').forEach(elem => {
        const key = elem.getAttribute('data-i18n-ph');
        if (i18n[lang][key]) {
            elem.placeholder = i18n[lang][key];
        }
    });

    // 4. 更新动态标题与按钮状态
    if (currentEditId) {
        document.getElementById('formTitle').innerText = `${i18n[lang].formTitleEdit} (${currentEditId})`;
        document.getElementById('saveBtn').innerText = i18n[lang].btnUpdate;
    } else {
        document.getElementById('formTitle').innerText = i18n[lang].formTitleAdd;
        document.getElementById('saveBtn').innerText = i18n[lang].btnSave;
    }

    // 5. 重新渲染表格数据（更新表格内部的年龄单位、按钮文字等）
    renderTable(document.getElementById('searchInput').value);
}

/**
 * 模拟数据库（Mock DB）模块
 */
const MockDatabase = {
    STORAGE_KEY: 'medical_db_records',

    init() {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            const initialData = [
                {
                    id: 'REC-1001',
                    name: '王小明',
                    gender: '男',
                    age: 32,
                    department: '内科',
                    symptoms: '反复咳嗽伴有轻微发热',
                    createdAt: new Date().toLocaleString()
                }
            ];
            this.saveAll(initialData);
        }
    },

    getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveAll(records) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    },

    insert(record) {
        const records = this.getAll();
        record.id = 'REC-' + Math.floor(1000 + Math.random() * 9000);
        record.createdAt = new Date().toLocaleString();
        records.unshift(record);
        this.saveAll(records);
        return record;
    },

    update(id, updatedFields) {
        let records = this.getAll();
        const index = records.findIndex(item => item.id === id);
        if (index !== -1) {
            records[index] = { ...records[index], ...updatedFields };
            this.saveAll(records);
            return true;
        }
        return false;
    },

    delete(id) {
        let records = this.getAll();
        records = records.filter(item => item.id !== id);
        this.saveAll(records);
    },

    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
};

let currentEditId = null;

// 页面加载完成后自动触发语言设置和数据加载
window.addEventListener('DOMContentLoaded', () => {
    MockDatabase.init();
    switchLanguage(currentLang);
});

// 渲染表格数据 (READ)
function renderTable(filterKeyword = '') {
    const records = MockDatabase.getAll();
    const tbody = document.getElementById('dataTable');
    const emptyState = document.getElementById('emptyState');
    const t = i18n[currentLang];
    
    tbody.innerHTML = '';

    const filteredRecords = records.filter(item => {
        const keyword = filterKeyword.toLowerCase();
        return item.name.toLowerCase().includes(keyword) || 
               item.department.toLowerCase().includes(keyword);
    });

    if (filteredRecords.length === 0) {
        emptyState.style.display = 'block';
        return;
    } else {
        emptyState.style.display = 'none';
    }

    filteredRecords.forEach(record => {
        // 科室名称映射翻译（若有）
        const genderText = record.gender === '男' ? t.optMale : t.optFemale;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${record.id}</code></td>
            <td><strong>${record.name}</strong></td>
            <td>${genderText} / ${record.age}${t.unitAge}</td>
            <td><span class="badge" style="background:#0052d9; color:#fff">${record.department}</span></td>
            <td>${record.symptoms || t.noSymptoms}</td>
            <td><small>${record.createdAt}</small></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="editRecord('${record.id}')">${t.btnEdit}</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRecord('${record.id}')">${t.btnDelete}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 处理表单提交（创建 / 修改）
function handleFormSubmit(event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('patientName').value.trim(),
        gender: document.getElementById('gender').value,
        age: parseInt(document.getElementById('age').value),
        department: document.getElementById('department').value,
        symptoms: document.getElementById('symptoms').value.trim()
    };

    if (currentEditId) {
        MockDatabase.update(currentEditId, formData);
        currentEditId = null;
    } else {
        MockDatabase.insert(formData);
    }

    resetForm();
    renderTable(document.getElementById('searchInput').value);
}

// 进入编辑状态
function editRecord(id) {
    const records = MockDatabase.getAll();
    const record = records.find(item => item.id === id);
    const t = i18n[currentLang];

    if (record) {
        currentEditId = record.id;
        document.getElementById('formTitle').innerText = `${t.formTitleEdit} (${record.id})`;
        document.getElementById('patientName').value = record.name;
        document.getElementById('gender').value = record.gender;
        document.getElementById('age').value = record.age;
        document.getElementById('department').value = record.department;
        document.getElementById('symptoms').value = record.symptoms;
        document.getElementById('saveBtn').innerText = t.btnUpdate;
    }
}

// 删除记录
function deleteRecord(id) {
    const t = i18n[currentLang];
    if (confirm(`${t.confirmDelete} [${id}]`)) {
        MockDatabase.delete(id);
        renderTable(document.getElementById('searchInput').value);
    }
}

// 重置表单状态
function resetForm() {
    currentEditId = null;
    document.getElementById('patientForm').reset();
    const t = i18n[currentLang];
    document.getElementById('formTitle').innerText = t.formTitleAdd;
    document.getElementById('saveBtn').innerText = t.btnSave;
}

// 实时搜索过滤
function handleSearch() {
    const keyword = document.getElementById('searchInput').value;
    renderTable(keyword);
}

// 清空全部数据库
function clearAllData() {
    const t = i18n[currentLang];
    if (confirm(t.confirmClear)) {
        MockDatabase.clear();
        renderTable();
    }
}