import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "codeigniter",
  project: "property-maintenance",
  branch: "feat/work-order-status-flow",
  indent: "Spaces: 4",
  files: [
    "app/Config/Routes.php",
    "app/Controllers/Api/WorkOrders.php",
    "app/Database/Migrations/2026-09-14-021530_CreateWorkOrders.php",
    "app/Enums/WorkOrderStatus.php",
    "app/Filters/ManagerOnly.php",
    "app/Models/WorkOrderModel.php",
    "tests/feature/WorkOrdersTest.php",
    ".env.example",
  ],
  snippets: [
    {
      filename: "app/Controllers/Api/WorkOrders.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Controllers\\Api;

use App\\Enums\\WorkOrderStatus;
use App\\Models\\WorkOrderModel;
use CodeIgniter\\HTTP\\ResponseInterface;
use CodeIgniter\\RESTful\\ResourceController;

class WorkOrders extends ResourceController
{
    protected $modelName = WorkOrderModel::class;
    protected $format    = 'json';

    public function index(): ResponseInterface
    {
        $propertyId = (int) $this->request->getGet('property_id');
        $status     = $this->request->getGet('status');

        if ($status !== null && WorkOrderStatus::tryFrom((string) $status) === null) {
            return $this->failValidationErrors(['status' => 'Unknown status filter.']);
        }

        $orders = $this->model
            ->forManager(auth()->id(), $propertyId ?: null, $status)
            ->paginate(20);

        return $this->respond([
            'data'  => $orders,
            'pager' => $this->model->pager->getDetails(),
        ]);
    }

    public function show($id = null): ResponseInterface
    {
        $order = $this->model->findForManager((int) $id, auth()->id());

        return $order === null
            ? $this->failNotFound('Work order not found.')
            : $this->respond($order);
    }

    public function create(): ResponseInterface
    {
        $rules = [
            'property_id' => 'required|is_natural_no_zero',
            'title'       => 'required|string|max_length[120]',
            'description' => 'permit_empty|string|max_length[2000]',
            'priority'    => 'required|in_list[low,normal,urgent]',
        ];

        if (! $this->validate($rules)) {
            return $this->failValidationErrors($this->validator->getErrors());
        }

        // Only fields that passed validation; extra POST keys are discarded here
        $data = $this->validator->getValidated();

        if (! $this->model->managerOwnsProperty(auth()->id(), (int) $data['property_id'])) {
            return $this->failForbidden('You do not manage this property.');
        }

        $id = $this->model->insert([
            ...$data,
            'reported_by' => auth()->id(),
            'status'      => WorkOrderStatus::Open->value,
        ]);

        return $this->respondCreated($this->model->find($id));
    }

    public function update($id = null): ResponseInterface
    {
        $order = $this->model->findForManager((int) $id, auth()->id());

        if ($order === null) {
            return $this->failNotFound('Work order not found.');
        }

        $current = WorkOrderStatus::from($order['status']);
        $next    = WorkOrderStatus::tryFrom((string) $this->request->getVar('status'));

        if ($next === null || ! $current->canTransitionTo($next)) {
            return $this->failValidationErrors(['status' => 'Invalid status transition.']);
        }

        $this->model->update($order['id'], ['status' => $next->value]);

        return $this->respond($this->model->find($order['id']));
    }
}
`,
    },
    {
      filename: "app/Models/WorkOrderModel.php",
      syntax: "clike",
      languageLabel: "PHP",
      code: `<?php

declare(strict_types=1);

namespace App\\Models;

use App\\Enums\\WorkOrderStatus;
use CodeIgniter\\Model;

class WorkOrderModel extends Model
{
    protected $table          = 'work_orders';
    protected $primaryKey     = 'id';
    protected $returnType     = 'array';
    protected $useSoftDeletes = true;
    protected $useTimestamps  = true;
    protected $dateFormat     = 'datetime';

    // Mass-assignment whitelist: anything not listed here is silently dropped
    protected $allowedFields = [
        'property_id',
        'reported_by',
        'assigned_contractor_id',
        'title',
        'description',
        'priority',
        'status',
        'completed_at',
    ];

    protected $validationRules = [
        'property_id' => 'required|is_natural_no_zero',
        'title'       => 'required|max_length[120]',
        'priority'    => 'required|in_list[low,normal,urgent]',
    ];

    protected $beforeUpdate = ['stampCompletion'];

    public function forManager(
        int $managerId,
        ?int $propertyId = null,
        ?string $status = null,
    ): static {
        $this->select('work_orders.*, properties.label AS property_label')
            ->select('contractors.trading_name AS contractor_name')
            ->join('properties', 'properties.id = work_orders.property_id')
            ->join('contractors', 'contractors.id = work_orders.assigned_contractor_id', 'left')
            ->where('properties.manager_id', $managerId);

        if ($propertyId !== null) {
            $this->where('work_orders.property_id', $propertyId);
        }

        if ($status !== null) {
            $this->where('work_orders.status', $status);
        }

        return $this->orderBy("FIELD(work_orders.priority, 'urgent', 'normal', 'low')", '', false)
            ->orderBy('work_orders.created_at', 'DESC');
    }

    public function findForManager(int $id, int $managerId): ?array
    {
        return $this->forManager($managerId)
            ->where('work_orders.id', $id)
            ->first();
    }

    public function managerOwnsProperty(int $managerId, int $propertyId): bool
    {
        return $this->db->table('properties')
            ->where('id', $propertyId)
            ->where('manager_id', $managerId)
            ->countAllResults() > 0;
    }

    protected function stampCompletion(array $data): array
    {
        $status = $data['data']['status'] ?? null;

        if ($status === WorkOrderStatus::Completed->value) {
            $data['data']['completed_at'] = date('Y-m-d H:i:s');
        }

        return $data;
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "In `WorkOrders::update` I only send `status`, but the model has `validationRules` that require `title` and `priority`. Why doesn't the update fail?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Because `Model::update()` cleans the rules first. CodeIgniter 4 has `$cleanValidationRules = true` by default, and on update it drops any rule whose field isn't in the data being saved. Here that's only `status`, so `title` and `priority` aren't checked.\n\nThat's convenient, but it also means `status` is never validated at model level, because it has no rule at all. The controller covers it with `WorkOrderStatus::tryFrom()` and `canTransitionTo()`, which is the right place for state-machine logic. If anything else writes to this model (a CLI command or a queue job), add a model rule too:\n\n```php\n'status' => 'permit_empty|in_list[open,assigned,in_progress,completed,cancelled]',\n```",
      delay: 13000,
    },
    {
      role: "user",
      content:
        "Is `findForManager` safe against someone requesting another manager's work order by ID?",
      delay: 26000,
    },
    {
      role: "assistant",
      content:
        "Yes. The ownership check is in the query, not after it. `forManager()` inner-joins `properties` and adds `where('properties.manager_id', $managerId)`, so a foreign ID returns `null` and the controller responds 404 rather than 403, which avoids confirming the record exists.\n\nTwo things to watch:\n1. Because the builder state is shared on the model instance, never call `forManager()` and then bail out without running the query. The pending `where` clauses would leak into the next call, such as the `find()` in `update`.\n2. Soft deletes still apply. CI4 qualifies the column as `work_orders.deleted_at`, so the join doesn't make it ambiguous.\n\nAll values go through the query builder's bindings, so there's no injection risk. The only raw SQL is the `FIELD()` sort, which is a constant.",
      delay: 37000,
    },
    {
      role: "user",
      content: "Speaking of `FIELD()`, we might move to Postgres next year.",
      delay: 51000,
    },
    {
      role: "assistant",
      content:
        "`FIELD()` is MySQL-only, so that line would break. A portable option is a `CASE` expression:\n\n```php\n->orderBy(\"CASE work_orders.priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END\", '', false)\n```\n\nA cleaner fix is to store priority as a small integer (`priority_rank`) and sort on that column. It's indexable, so the composite index `(property_id, status, priority_rank)` can serve both the filter and the sort. For coverage, use `FeatureTestTrait` with `withSession()` or Shield's `actingAs()` and assert that a second manager gets a 404 on `GET /api/work-orders/{id}`.",
      delay: 63000,
    },
  ],
};

export default config;
